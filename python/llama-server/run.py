from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from llama_server import load_llama_server_config, serve


def main() -> None:
    serve(load_llama_server_config())


if __name__ == "__main__":
    main()
