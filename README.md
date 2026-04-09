## Running dev environment

To run the whole shit in dev mode, use command provided below in the root directory.

```bash
docker compose -f dev.docker-compose.yml up --build
```

Dockerfiles and docker-compose for production will come in the future lol. They will also include redis and postgress because why not.

Containers can communicate with each other using:

```
http://backend:8000
ws://backend:8000
```

However, frontend requests come from browser, not from the container itself, so they should be just directed here:

```
http://localhost:8000
ws://localhost:8000
```
