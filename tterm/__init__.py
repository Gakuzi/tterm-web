"""tTerm Web: the core, its API and, from 0.0.3, the signer, in one package.

Everything runs from the repository root, not from inside the package:

    python -m tterm.dev      the whole thing on this computer
    python -m tterm.serve    the core on a server, with the signer as a
                             service of its own (deploy/)
    python -m tterm.tests    the checks
"""

__version__ = "0.1.25"
