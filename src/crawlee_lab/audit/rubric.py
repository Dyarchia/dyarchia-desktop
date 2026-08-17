"""What the models are asked, and the shape the answer has to come back in.

Two questions, kept apart on purpose. Whether a page is *readable* is a question about extraction
and is answered from the text alone. Whether a page is *wanted* is a question about the corpus and
is answered from what the corpus is for. Asking them together produces answers that confuse a badly
extracted page about a useful topic with a well extracted page about an irrelevant one, and those
two findings lead to opposite actions: fix the extractor, or exclude the URL.

The prompts are deliberately short. They are paid for once per batch of pages rather than once per
page, but they are also the part of the request that repeats, and a long rubric on a cheap model is
the largest avoidable line in the bill.
"""

from __future__ import annotations

from typing import Any

PURPOSE = (
    'The corpus is documentation about AI models and developer tooling, kept so that a working '
    'programmer, and the coding agents they run, can learn from it and write code against it.'
)

KEEP = (
    'API reference, guides, tutorials, conceptual explanation, code examples, SDK and CLI '
    'documentation, prompting and integration guidance.'
)

DROP = (
    'marketing and product announcements, pricing and plan comparisons, legal and policy text, '
    'availability and region notices, partner and customer lists, changelogs and release notes, '
    'account, billing and console administration guides, and index pages that are nothing but a '
    'list of links to other pages.'
)

FORM_INSTRUCTIONS = f"""You are auditing pages scraped into a documentation corpus. {PURPOSE}

For each page you are given an excerpt: its opening, a slice of its middle, and its ending, joined
by [...]. Judge only what the excerpt shows.

Answer two independent questions per page.

form - is this readable markdown that a person or a model could learn from?
  ok           prose, headings and code blocks, whatever its subject
  mdx-residue  raw component or HTML tags left in the text, class names, layout markup
  nav-dump     mostly navigation, link lists or breadcrumbs rather than content
  truncated    stops mid-sentence or mid-example, or a code block runs to the end
  empty        no substantive content at all

relevance - does this page belong in the corpus described above?
  keep  {KEEP}
  drop  {DROP}

A badly formatted page about a useful topic is form=bad, relevance=keep. A cleanly extracted
pricing page is form=ok, relevance=drop. Do not let one answer decide the other.

Set confidence to low when the excerpt does not show you enough to be sure. Low confidence is
useful and costs nothing; a confident wrong answer is what this audit cannot afford.

Keep every reason under twenty words and say what you saw, not what you inferred."""

SECTION_INSTRUCTIONS = f"""You are pruning a scraped documentation corpus. {PURPOSE}

For each section you are given its URL prefix, how many pages it holds, and a few sample titles
with the first words of each page. Rule on the section as a whole.

  keep   the section is {KEEP}
  drop   the section is {DROP}
  mixed  the section genuinely holds both, so its pages must be judged one at a time

Prefer keep or drop. Answer mixed only when the samples actually disagree with each other, because
mixed sends every page of the section to be read individually, and a large section answered mixed
costs more than every other question in this audit combined."""

PAGE_VERDICT_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'pages': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'id': {'type': 'string'},
                    'form': {
                        'type': 'string',
                        'enum': ['ok', 'mdx-residue', 'nav-dump', 'truncated', 'empty'],
                    },
                    'relevance': {'type': 'string', 'enum': ['keep', 'drop']},
                    'confidence': {'type': 'string', 'enum': ['low', 'medium', 'high']},
                    'reason': {'type': 'string'},
                },
                'required': ['id', 'form', 'relevance', 'confidence', 'reason'],
                'additionalProperties': False,
            },
        }
    },
    'required': ['pages'],
    'additionalProperties': False,
}

SECTION_VERDICT_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'sections': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'id': {'type': 'string'},
                    'verdict': {'type': 'string', 'enum': ['keep', 'drop', 'mixed']},
                    'confidence': {'type': 'string', 'enum': ['low', 'medium', 'high']},
                    'reason': {'type': 'string'},
                },
                'required': ['id', 'verdict', 'confidence', 'reason'],
                'additionalProperties': False,
            },
        }
    },
    'required': ['sections'],
    'additionalProperties': False,
}


def page_prompt(pages: list[tuple[str, str, str]]) -> str:
    """Render a batch of pages as one request. Each entry is (id, url, excerpt)."""
    blocks = [f'<page id="{identifier}" url="{url}">\n{text}\n</page>' for identifier, url, text in pages]
    return 'Audit each of the following pages.\n\n' + '\n\n'.join(blocks)


def section_prompt(sections: list[tuple[str, str]]) -> str:
    """Render a batch of sections as one request. Each entry is (id, rendered brief)."""
    blocks = [f'<section id="{identifier}">\n{brief}\n</section>' for identifier, brief in sections]
    return 'Rule on each of the following sections.\n\n' + '\n\n'.join(blocks)
