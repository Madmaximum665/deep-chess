"""
model.py - AlphaZero-style Neural Network for Chess
Architecture:
  - Residual CNN backbone (19 blocks, 256 filters)
  - Policy head  → probability over all moves
  - Value head   → board evaluation (-1 to +1)
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import chess


# ── Constants ────────────────────────────────────────────────────
NUM_FILTERS   = 256
NUM_RES_BLOCKS = 10        # Use 19+ for stronger play (needs more VRAM)
POLICY_OUTPUT = 4672       # All possible chess moves encoded
BOARD_PLANES  = 119        # AlphaZero-style input planes


# ── Board Encoding ───────────────────────────────────────────────
PIECE_TYPES = [chess.PAWN, chess.KNIGHT, chess.BISHOP,
               chess.ROOK, chess.QUEEN, chess.KING]

def board_to_tensor(board: chess.Board, history: list = None) -> torch.Tensor:
    """
    Encode board as (119, 8, 8) tensor.
    Planes 0-11  : current pieces (6 ours + 6 theirs)
    Planes 12-14 : move, castling, en passant
    Planes 15-118: last 7 board states (repetition detection)
    """
    planes = np.zeros((119, 8, 8), dtype=np.float32)
    color  = board.turn

    # Current position
    for i, pt in enumerate(PIECE_TYPES):
        for sq in board.pieces(pt, color):
            planes[i, sq // 8, sq % 8] = 1.0
        for sq in board.pieces(pt, not color):
            planes[6 + i, sq // 8, sq % 8] = 1.0

    planes[12] = 1.0 if color == chess.WHITE else 0.0

    # Castling (4 rights → broadcast into plane 13)
    castling = (
        board.has_kingside_castling_rights(chess.WHITE),
        board.has_queenside_castling_rights(chess.WHITE),
        board.has_kingside_castling_rights(chess.BLACK),
        board.has_queenside_castling_rights(chess.BLACK),
    )
    planes[13, :4, 0] = [float(c) for c in castling]

    # En passant
    if board.ep_square is not None:
        planes[14, :, board.ep_square % 8] = 1.0

    # History planes (last 7 positions)
    if history:
        for h_idx, hist_board in enumerate(history[-7:]):
            offset = 15 + h_idx * 14
            for i, pt in enumerate(PIECE_TYPES):
                for sq in hist_board.pieces(pt, color):
                    planes[offset + i, sq // 8, sq % 8] = 1.0
                for sq in hist_board.pieces(pt, not color):
                    planes[offset + 6 + i, sq // 8, sq % 8] = 1.0

    return torch.tensor(planes, dtype=torch.float32)


def move_to_index(move: chess.Move) -> int:
    """Encode a chess.Move into policy index [0, 4671]."""
    from_sq = move.from_square
    to_sq   = move.to_square
    promo   = move.promotion
    if promo and promo != chess.QUEEN:
        promo_map = {chess.KNIGHT: 0, chess.BISHOP: 1, chess.ROOK: 2}
        col_dir = 1 if (to_sq % 8) > (from_sq % 8) else (0 if (to_sq % 8) == (from_sq % 8) else -1)
        return 4096 + from_sq * 3 + promo_map.get(promo, 0)
    return from_sq * 64 + to_sq

def index_to_move(index: int, board: chess.Board) -> chess.Move | None:
    """Decode policy index back to a legal chess.Move."""
    for move in board.legal_moves:
        if move_to_index(move) == index:
            return move
    return None


# ── Residual Block ───────────────────────────────────────────────
class ResBlock(nn.Module):
    def __init__(self, filters: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(filters, filters, 3, padding=1, bias=False),
            nn.BatchNorm2d(filters),
            nn.ReLU(inplace=True),
            nn.Conv2d(filters, filters, 3, padding=1, bias=False),
            nn.BatchNorm2d(filters),
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.relu(x + self.net(x))


# ── Main Network ─────────────────────────────────────────────────
class ChessNet(nn.Module):
    """
    AlphaZero-style dual-head network.
    Input  : (B, 119, 8, 8) board tensor
    Outputs: policy logits (B, 4672), value scalar (B, 1)
    """
    def __init__(self, num_filters=NUM_FILTERS, num_res_blocks=NUM_RES_BLOCKS):
        super().__init__()

        # Stem
        self.stem = nn.Sequential(
            nn.Conv2d(BOARD_PLANES, num_filters, 3, padding=1, bias=False),
            nn.BatchNorm2d(num_filters),
            nn.ReLU(inplace=True),
        )

        # Residual tower
        self.res_tower = nn.Sequential(
            *[ResBlock(num_filters) for _ in range(num_res_blocks)]
        )

        # Policy head
        self.policy_head = nn.Sequential(
            nn.Conv2d(num_filters, 2, 1, bias=False),
            nn.BatchNorm2d(2),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(2 * 8 * 8, POLICY_OUTPUT),
        )

        # Value head
        self.value_head = nn.Sequential(
            nn.Conv2d(num_filters, 1, 1, bias=False),
            nn.BatchNorm2d(1),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(8 * 8, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, 1),
            nn.Tanh(),   # output in [-1, +1]
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor):
        x = self.stem(x)
        x = self.res_tower(x)
        policy = self.policy_head(x)
        value  = self.value_head(x)
        return policy, value

    def predict(self, board: chess.Board, history: list = None, device="cpu"):
        """
        Single-board inference (no grad).
        Returns: (policy_probs np.array shape [4672], value float)
        """
        self.eval()
        with torch.no_grad():
            tensor = board_to_tensor(board, history).unsqueeze(0).to(device)
            policy_logits, value = self(tensor)

            # Mask illegal moves
            legal_mask = torch.zeros(POLICY_OUTPUT, dtype=torch.bool, device=device)
            for move in board.legal_moves:
                legal_mask[move_to_index(move)] = True

            policy_logits[0][~legal_mask] = float("-inf")
            policy_probs = torch.softmax(policy_logits[0], dim=0).cpu().numpy()

        return policy_probs, float(value[0, 0].cpu())


# ── Model factory ────────────────────────────────────────────────
def build_model(device="cpu") -> ChessNet:
    model = ChessNet()
    model.to(device)
    return model


def save_model(model: ChessNet, path: str):
    torch.save(model.state_dict(), path)
    print(f"✅ Model saved → {path}")


def load_model(path: str, device="cpu") -> ChessNet:
    model = ChessNet()
    model.load_state_dict(torch.load(path, map_location=device))
    model.to(device)
    model.eval()
    print(f"✅ Model loaded ← {path}")
    return model
  
