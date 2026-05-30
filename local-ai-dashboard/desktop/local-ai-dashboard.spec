# PyInstaller spec — `pyinstaller desktop/local-ai-dashboard.spec`
# Produces a single-folder (one-dir) build under dist/local-ai-dashboard/
# Frontend (HTML + JSX) and the backend's `app/` package are bundled as data.

from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Paths relative to the spec file's location.
HERE = Path(SPECPATH).resolve()
ROOT = HERE.parent  # project root
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


datas = [
    (str(FRONTEND), "frontend"),
    (str(BACKEND / "app"), "app"),
]
# Include any data files registered with the FastAPI app (none today, but cheap).
datas += collect_data_files("app", include_py_files=False)

hidden = []
# FastAPI / uvicorn ecosystem ships modules dynamically — collect them.
for pkg in (
    "uvicorn", "uvicorn.lifespan", "uvicorn.protocols",
    "anyio", "h11", "click", "starlette", "fastapi",
    "pydantic", "pydantic_settings",
    "anthropic", "httpx", "httpcore",
    "qdrant_client", "sentence_transformers",
    "pypdf", "psutil",
):
    try:
        hidden += collect_submodules(pkg)
    except Exception:
        pass

# Suppress some optional heavyweights that may not be present (e.g. torch when
# sentence-transformers isn't actually used at build time).
excludes = ["tkinter", "test", "tests"]


a = Analysis(
    [str(HERE / "launcher.py")],
    pathex=[str(ROOT), str(BACKEND)],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="local-ai-dashboard",
    console=False,
    icon=None,
    disable_windowed_traceback=False,
    onefile=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="local-ai-dashboard",
)
