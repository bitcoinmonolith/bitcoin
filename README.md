# Bitcoin

Experimental Bitcoin node and client. Still a work in progress, not ready for real use. Stuff will break. Don’t connect
to mainnet or use real funds.

For learning, hacking, or just messing around (for now).

Fully made in Deno and TypeScript.

Optimizes of storage using a few GB of disk space while not sacrificing performance.

## Notes

- The whole codebase uses wire format internally, so there is no `.reverse()` or `.toReversed()` in the whole codebase
  except for console logging.
