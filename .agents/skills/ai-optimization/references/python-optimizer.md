# Python & ML/AI Optimizer Reference

## AST Extraction Rules (use in scripts)
- Parse with `ast.parse(source, filename)`
- Visitor collects:
  - Module: `ast.get_docstring(node)`
  - For each `ClassDef`: name, bases, keywords (for decorators like @dataclass, @pydantic), docstring, list of methods (only public or dunder if relevant)
  - For each `FunctionDef` / `AsyncFunctionDef`: name, args (with annotations if present), returns, docstring (first sentence only)
- Special ML detectors:
  - If inherits from `nn.Module`, `torch.nn.Module`, `lightning.pytorch.LightningModule`, `flax.linen.Module`, `keras.Model`, `tf.keras.Model`:
    - Summarize architecture in ONE line using layer count, dimensions, activation patterns.
    - List all `self.xxx = nn.XXX(...)` assignments as "layers: [list of layer types and key params]"
  - Training scripts: detect `for epoch in range(epochs):`, `optimizer.zero_grad()`, `loss.backward()`, `scheduler.step()` → output "Standard training loop with early stopping, mixed precision (if autocast present), gradient accumulation steps=X"

## Token-Saving Patterns
- Long `if __name__ == "__main__":` blocks → "CLI entrypoint: parses args with argparse/typer, calls main()"
- Pytest fixtures or test files → "Test coverage for UserService: happy path, invalid email, duplicate username (3 tests, all pass in previous run)"
- Config files (yaml, toml, .env) → Never include full. Summarize as "config: DEBUG=False, DB_URL=postgres://..., MODEL_PATH=./models/v3, MAX_TOKENS=4096"

## Example Compressed Output
```python
# users/models.py (1423 LOC → 87 tokens)
"""User domain models and repository."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class User(BaseModel):
    """Core user entity."""
    id: int
    email: str
    # ... 9 more fields (full in source)
    created_at: datetime
    is_active: bool = True

class UserRepository:
    """SQLAlchemy / Prisma / SQLModel repository."""
    async def get_by_email(self, email: str) -> Optional[User]: ...
    async def create(self, data: dict) -> User: ...
    # 4 more methods (implementation uses session, commits, raises IntegrityError on duplicate)

# In ML context:
class UserEmbeddingModel(nn.Module):
    """Transformer-based user preference encoder. 6 layers, d_model=256, 8 heads."""
    def __init__(self):
        self.embed = nn.Embedding(10000, 256)
        self.transformer = nn.TransformerEncoder(...)  # 6 layers
        self.head = nn.Linear(256, 128)
    def forward(self, x):
        # embed → positional → transformer → mean pool → linear
        ...
```
