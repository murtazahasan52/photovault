# Vercel Python serverless entry point — serves every /api/* request with the FastAPI app.
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from server import app  # noqa: E402,F401  (Vercel looks for a module-level `app`)
