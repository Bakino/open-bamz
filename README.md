# Open BamZ

Open BamZ is a open source platform to create applications. 
It is modular with a plugin system.

This is the repository of the core of Open BamZ. Many features are available through plugins

# End user installation guide

By "end user", we means user that want to install Open BamZ to develop application, not to develop Open BamZ itself.

## Generate JWT keys

Open BamZ use JWT keys. Create your own keys using : 
```bash
openssl genrsa -out jwtRS256.key 2048
openssl rsa -in jwtRS256.key -pubout -out jwtRS256.key.pub
```

In the docker-compose.yml adjust these line to give access to the keys to the application :
```yaml
      - ./jwt_keys/jwtRS256.key:/home/node/jwtRS256.key:ro 
      - ./jwt_keys/jwtRS256.key.pub:/home/node/jwtRS256.key.pub:ro 
```

TO COMPLETE

# Open BamZ developper installation guide

These instruction are for the developpers that want to contribute to Open BamZ itself.

The Open BamZ code base is delivered with devcontainer settings. As a requirement, install [VSCode](https://code.visualstudio.com/) with [devcontainer extension](vscode:extension/ms-vscode-remote.remote-containers)

Prepare 2 docker volume : 
```
docker volume create dev-open-bamz-pg
docker volume create dev-open-bamz-data
```

Clone the repository and open it in VSCode, VSCode will suggest to "Reopen in container", click on the button to reopen the folder in the container

👉 What should I do if I don't want to use VSCode or devcontainer ? We suggest to use the devcontainer to ensure the Node.js and PostgreSQL version and run in a clean environnement but there nothing much more about it so you can just install a local Node.js and PostgreSQL and run it directly without devcontainer. You can look at expected version in Dockerfiles and docker-compose, as well as the environnment variable that are expected to connect to the database
