"""The one error type song2mv raises for problems a user or agent can fix (bad input, missing tool, wrong folder).

The CLI turns it into a one-line message on stderr (plus a hint), an `{"ok": false, "error": ...}` object on stdout
under --json, and exit code 2. Anything else that escapes is a bug and is reported the same way.
"""
from __future__ import annotations


class Song2mvError(Exception):
    def __init__(self, message: str, hint: str | None = None):
        super().__init__(message)
        self.message = message
        self.hint = hint
