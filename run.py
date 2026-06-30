"""Launch TESTFORGE. Run:  python run.py   then open http://127.0.0.1:8000"""

from __future__ import annotations

import webbrowser

import uvicorn

HOST = "127.0.0.1"
PORT = 8000


def main() -> None:
    url = f"http://{HOST}:{PORT}"
    print("=" * 60)
    print("  TESTFORGE ")
    print(f"  Serving at {url}")
    print("=" * 60)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
