"""
train.py - AlphaZero-style Self-Play Training Loop
"""
import os
import argparse
import time
import json
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import torch.multiprocessing as mp
from torch.utils.data import DataLoader, Dataset
from multiprocessing import Pool
import chess

from model import ChessNet, board_to_tensor, move_to_index, save_model, load_model
from mcts import MCTS


# ── Config ───────────────────────────────────────────────────────
DEFAULT_CONFIG = {
    "iterations":         50,
    "games_per_iter":     25,
    "games_per_worker":   3,
    "simulations":        400,
    "max_game_moves":     200,
    "replay_buffer_size": 50_000,
    "batch_size":         256,
    "epochs_per_iter":    10,
    "lr":                 1e-3,
    "lr_decay_steps":     [20, 35, 45],
    "weight_decay":       1e-4,
    "eval_games":         20,
    "win_threshold":      0.55,
    "temperature_moves":  30,
    "device":             "cuda" if torch.cuda.is_available() else "cpu",
    "save_dir":           "models",
    "log_file":           "training_log.json",
}


# ── Replay Buffer ────────────────────────────────────────────────
class ReplayBuffer:
    def __init__(self, maxlen=50_000):
        self.buffer = deque(maxlen=maxlen)

    def add(self, state: np.ndarray, policy: np.ndarray, value: float):
        self.buffer.append((state, policy, value))

    def __len__(self):
        return len(self.buffer)


class ChessDataset(Dataset):
    def __init__(self, buffer: ReplayBuffer):
        self.data = list(buffer.buffer)

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        state, policy, value = self.data[idx]
        return (
            torch.tensor(state,  dtype=torch.float32),
            torch.tensor(policy, dtype=torch.float32),
            torch.tensor([value], dtype=torch.float32),
        )


# ── Self-Play Game (THE MISSING FUNCTION) ────────────────────────
def self_play_game(model: ChessNet, config: dict, device: str = "cpu") -> list:
    """
    Play one complete game of self-play using MCTS.
    Returns list of (state_tensor, mcts_policy, outcome) tuples.
    """
    mcts      = MCTS(model, device=device, simulations=config["simulations"])
    board     = chess.Board()
    history   = []
    game_data = []   # (state, policy, current_player_color)
    move_count = 0

    while not board.is_game_over() and move_count < config["max_game_moves"]:
        # Use temperature=1 for first N moves (explore), then 0 (exploit)
        temp = 1.0 if move_count < config["temperature_moves"] else 0.0

        # Record state + MCTS policy before making the move
        state  = board_to_tensor(board, history).numpy()
        policy = mcts.policy_vector(board)
        move   = mcts.best_move(board, temperature=temp)

        game_data.append((state, policy, board.turn))

        history.append(board.copy())
        board.push(move)
        move_count += 1

    # Determine game outcome
    result = board.result()
    if result == "1-0":
        white_value =  1.0
    elif result == "0-1":
        white_value = -1.0
    else:
        white_value =  0.0  # draw or move limit

    # Assign value from each position's perspective
    training_examples = []
    for state, policy, turn in game_data:
        value = white_value if turn == chess.WHITE else -white_value
        training_examples.append((state, policy, value))

    return training_examples


# ── Parallel Self-Play ───────────────────────────────────────────
def self_play_worker(args):
    """Runs in a separate CPU process — must import everything locally."""
    # Local imports required for multiprocessing subprocess
    from train import self_play_game
    from model import load_model

    model_path, config, worker_id = args
    model = load_model(model_path, device="cpu")

    examples = []
    for _ in range(config["games_per_worker"]):
        game_data = self_play_game(model, config, device="cpu")
        examples.extend(game_data)
    return examples


def parallel_self_play(model, config, save_dir, num_workers=None):
    """
    Run self-play across all CPU cores in parallel.
    GPU stays free during this phase — used only for training.
    """
    if num_workers is None:
        num_workers = mp.cpu_count()

    # Save model to disk so worker subprocesses can load it
    temp_path = f"{save_dir}/temp_worker_model.pt"
    save_model(model, temp_path)

    games_per_worker = max(1, config["games_per_iter"] // num_workers)
    worker_args = [
        (temp_path, {**config, "games_per_worker": games_per_worker}, i)
        for i in range(num_workers)
    ]

    print(f"   🔀 Launching {num_workers} CPU workers ({games_per_worker} games each)...")

    with Pool(processes=num_workers) as pool:
        results = pool.map(self_play_worker, worker_args)

    all_examples = [ex for worker_result in results for ex in worker_result]
    print(f"   ✅ Collected {len(all_examples)} examples from {num_workers} workers")
    return all_examples


# ── Training Step ────────────────────────────────────────────────
def train_network(model: ChessNet, buffer: ReplayBuffer, config: dict, device: str, iteration: int):
    """Train neural network on replay buffer."""
    model.train()
    dataset    = ChessDataset(buffer)
    dataloader = DataLoader(dataset, batch_size=config["batch_size"],
                            shuffle=True, num_workers=0, pin_memory=(device == "cuda"))

    optimizer = optim.Adam(model.parameters(),
                           lr=config["lr"], weight_decay=config["weight_decay"])

    # Learning rate decay
    if iteration in config["lr_decay_steps"]:
        for pg in optimizer.param_groups:
            pg["lr"] *= 0.1
        print(f"   📉 LR decayed → {optimizer.param_groups[0]['lr']:.2e}")

    policy_loss_fn = nn.CrossEntropyLoss()
    value_loss_fn  = nn.MSELoss()

    total_policy_loss = 0.0
    total_value_loss  = 0.0
    batches = 0

    for epoch in range(config["epochs_per_iter"]):
        for states, policies, values in dataloader:
            states   = states.to(device)
            policies = policies.to(device)
            values   = values.to(device)

            policy_logits, pred_values = model(states)

            p_loss = policy_loss_fn(policy_logits, policies)
            v_loss = value_loss_fn(pred_values, values)
            loss   = p_loss + v_loss

            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            total_policy_loss += p_loss.item()
            total_value_loss  += v_loss.item()
            batches += 1

    avg_p = total_policy_loss / max(batches, 1)
    avg_v = total_value_loss  / max(batches, 1)
    print(f"   📉 Policy loss: {avg_p:.4f} | Value loss: {avg_v:.4f}")
    return avg_p, avg_v


# ── Evaluation ───────────────────────────────────────────────────
def evaluate_models(new_model: ChessNet, best_model: ChessNet,
                    config: dict, device: str) -> float:
    """Play eval_games between new and best model. Returns win rate of new model."""
    new_mcts  = MCTS(new_model,  device=device, simulations=config["simulations"])
    best_mcts = MCTS(best_model, device=device, simulations=config["simulations"])

    new_wins = 0
    draws    = 0

    for game_idx in range(config["eval_games"]):
        board = chess.Board()
        new_is_white = (game_idx % 2 == 0)
        move_count = 0

        while not board.is_game_over() and move_count < config["max_game_moves"]:
            if (board.turn == chess.WHITE) == new_is_white:
                move = new_mcts.best_move(board, temperature=0.0)
            else:
                move = best_mcts.best_move(board, temperature=0.0)
            board.push(move)
            move_count += 1

        result = board.result()
        if result == "1-0":
            winner_is_new = new_is_white
        elif result == "0-1":
            winner_is_new = not new_is_white
        else:
            winner_is_new = None

        if winner_is_new is True:
            new_wins += 1
        elif winner_is_new is None:
            draws += 1

    win_rate = (new_wins + 0.5 * draws) / config["eval_games"]
    print(f"   🏆 New model: {new_wins}W / {draws}D / {config['eval_games']-new_wins-draws}L  "
          f"(win rate: {win_rate:.2%})")
    return win_rate


# ── Main Training Loop ───────────────────────────────────────────
def train(config: dict, resume_path: str = None):
    os.makedirs(config["save_dir"], exist_ok=True)
    device = config["device"]
    print(f"🖥️  Device: {device}")
    if device == "cuda":
        print(f"   GPU: {torch.cuda.get_device_name(0)}")

    # Initialise models
    if resume_path and os.path.exists(resume_path):
        best_model = load_model(resume_path, device)
        print(f"▶️  Resumed from {resume_path}")
    else:
        best_model = ChessNet().to(device)
        print("🆕  Starting fresh model")

    new_model = ChessNet().to(device)
    new_model.load_state_dict(best_model.state_dict())

    buffer = ReplayBuffer(maxlen=config["replay_buffer_size"])
    log    = []

    for iteration in range(1, config["iterations"] + 1):
        iter_start = time.time()
        print(f"\n{'='*60}")
        print(f"🔄 Iteration {iteration}/{config['iterations']}")

        # ── 1. Self-Play (all CPU cores in parallel) ─────────────
        print(f"🎮 Parallel self-play ({config['games_per_iter']} games, "
              f"{config['simulations']} sims/move, "
              f"{mp.cpu_count()} CPU workers)...")
        all_examples = parallel_self_play(new_model, config, config["save_dir"])
        for ex in all_examples:
            buffer.add(*ex)
        print(f"   ✅ Buffer size: {len(buffer):,}")

        # ── 2. Train on GPU ──────────────────────────────────────
        print(f"🏋️  Training on {len(buffer):,} examples...")
        p_loss, v_loss = train_network(new_model, buffer, config, device, iteration)

        # ── 3. Evaluate new vs best ──────────────────────────────
        print(f"⚔️  Evaluating new vs best ({config['eval_games']} games)...")
        win_rate = evaluate_models(new_model, best_model, config, device)

        # ── 4. Promote or revert ─────────────────────────────────
        promoted = False
        if win_rate >= config["win_threshold"]:
            best_model.load_state_dict(new_model.state_dict())
            save_model(best_model, f"{config['save_dir']}/best.pt")
            promoted = True
            print(f"   ✅ New model promoted! (win rate {win_rate:.2%} ≥ {config['win_threshold']:.0%})")
        else:
            new_model.load_state_dict(best_model.state_dict())
            print(f"   ❌ Not promoted (win rate {win_rate:.2%} < {config['win_threshold']:.0%})")

        # Checkpoint every 5 iterations
        if iteration % 5 == 0:
            ckpt_path = f"{config['save_dir']}/checkpoint_iter{iteration}.pt"
            save_model(new_model, ckpt_path)

        elapsed = time.time() - iter_start
        print(f"⏱️  Iteration time: {elapsed/60:.1f} min")

        log.append({
            "iteration":   iteration,
            "win_rate":    round(win_rate, 4),
            "promoted":    promoted,
            "policy_loss": round(p_loss, 4),
            "value_loss":  round(v_loss, 4),
            "buffer_size": len(buffer),
            "elapsed_min": round(elapsed / 60, 2),
        })
        with open(config["log_file"], "w") as f:
            json.dump(log, f, indent=2)

    print(f"\n🏁 Training complete! Best model → {config['save_dir']}/best.pt")


# ── CLI ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train AlphaZero Chess Bot")
    parser.add_argument("--iterations",      type=int, default=50)
    parser.add_argument("--games_per_iter",  type=int, default=25)
    parser.add_argument("--simulations",     type=int, default=400)
    parser.add_argument("--batch_size",      type=int, default=256)
    parser.add_argument("--epochs_per_iter", type=int, default=10)
    parser.add_argument("--eval_games",      type=int, default=20)
    parser.add_argument("--resume",          type=str, default=None)
    parser.add_argument("--save_dir",        type=str, default="models")
    args = parser.parse_args()

    config = DEFAULT_CONFIG.copy()
    config.update({
        "iterations":      args.iterations,
        "games_per_iter":  args.games_per_iter,
        "simulations":     args.simulations,
        "batch_size":      args.batch_size,
        "epochs_per_iter": args.epochs_per_iter,
        "eval_games":      args.eval_games,
        "save_dir":        args.save_dir,
    })

    train(config, resume_path=args.resume)
