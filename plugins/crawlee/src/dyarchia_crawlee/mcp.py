"""A Model Context Protocol server over stdio, exposing the corpus search as one tool.

An agent that can call this tool can read the documentation a corpus repository holds without
leaving its run: the kanban passes the server to a worker with `--mcp-config`, and a skill can
name it. The protocol is JSON-RPC 2.0, one message per line on stdin and stdout, and the four
methods a client sends before and while using a tool are the four handled here. Anything else
is answered with the standard method-not-found error rather than ignored, so a client that asks
for a capability this server lacks finds out.

No dependency: the wire format is small enough to write down, and a package that imports the
crawler stack to answer a search would cost three seconds per launch for nothing.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from dyarchia_crawlee import __version__
from dyarchia_crawlee.errors import DyarchiaCrawleeError

PROTOCOL = '2025-06-18'

TOOL = {
    'name': 'search_corpus',
    'description': (
        'Full-text search over the documentation this machine has snapshotted with '
        'dyarchia-crawlee: one or more corpus repositories, each holding many targets. '
        'Words are matched together first and separately when nothing holds them all. '
        'Returns the best chunks with their page URL, title, heading and a snippet.'
    ),
    'inputSchema': {
        'type': 'object',
        'properties': {
            'query': {'type': 'string', 'description': 'words to look for'},
            'repository': {
                'type': 'string',
                'description': 'restrict to one corpus repository, by directory name',
            },
            'target': {'type': 'string', 'description': 'restrict to one target, by profile name'},
            'limit': {'type': 'integer', 'minimum': 1, 'maximum': 50, 'default': 10},
        },
        'required': ['query'],
    },
}


def _reply(request_id: Any, result: Any) -> dict[str, Any]:
    return {'jsonrpc': '2.0', 'id': request_id, 'result': result}


def _error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {'jsonrpc': '2.0', 'id': request_id, 'error': {'code': code, 'message': message}}


def _call(arguments: dict[str, Any]) -> dict[str, Any]:
    from dyarchia_crawlee.search import search

    query = str(arguments.get('query', ''))
    limit = int(arguments.get('limit', 10) or 10)
    try:
        hits = search(
            query,
            repository=arguments.get('repository') or None,
            target=arguments.get('target') or None,
            limit=max(1, min(limit, 50)),
        )
    except DyarchiaCrawleeError as error:
        return {'content': [{'type': 'text', 'text': str(error)}], 'isError': True}

    if not hits:
        return {'content': [{'type': 'text', 'text': 'nothing in the corpus matches'}]}

    lines = []
    for hit in hits:
        where = f'{hit.repository}/{hit.target}'
        head = f'{hit.title} — {hit.heading}' if hit.heading else hit.title
        lines.append(f'{head}\n{hit.url}\n[{where}] {hit.snippet}')
    return {
        'content': [{'type': 'text', 'text': '\n\n'.join(lines)}],
        'structuredContent': {'hits': [hit.to_dict() for hit in hits]},
    }


def handle(message: dict[str, Any]) -> dict[str, Any] | None:
    """Answer one request, or None for a notification, which has no answer by definition."""
    method = message.get('method')
    request_id = message.get('id')
    params = message.get('params') or {}

    if method == 'initialize':
        return _reply(
            request_id,
            {
                'protocolVersion': params.get('protocolVersion') or PROTOCOL,
                'capabilities': {'tools': {}},
                'serverInfo': {'name': 'dyarchia-corpus', 'version': __version__},
            },
        )
    if method == 'ping':
        return _reply(request_id, {})
    if method == 'tools/list':
        return _reply(request_id, {'tools': [TOOL]})
    if method == 'tools/call':
        if params.get('name') != TOOL['name']:
            return _error(request_id, -32602, f'unknown tool {params.get("name")!r}')
        return _reply(request_id, _call(params.get('arguments') or {}))
    if request_id is None:
        return None
    return _error(request_id, -32601, f'method not found: {method}')


def serve(stdin: Any = None, stdout: Any = None) -> None:
    """Read requests until stdin closes. Every answer is one line, flushed at once."""
    stdin = stdin or sys.stdin
    stdout = stdout or sys.stdout
    for raw in stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            stdout.write(json.dumps(_error(None, -32700, 'parse error')) + '\n')
            stdout.flush()
            continue
        answer = handle(message)
        if answer is not None:
            stdout.write(json.dumps(answer, ensure_ascii=False) + '\n')
            stdout.flush()
