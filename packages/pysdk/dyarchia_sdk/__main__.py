import argparse
from pathlib import Path

from .host import serve


def main() -> None:
    parser = argparse.ArgumentParser(prog="dyarchia_sdk")
    parser.add_argument("plugin_dir", type=Path)
    serve(parser.parse_args().plugin_dir)


if __name__ == "__main__":
    main()
