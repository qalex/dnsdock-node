
import Docker = require("dockerode");
const docker = new Docker({socketPath: '/var/run/docker.sock'});

export let runningContainers : { [key:string]: Docker.ContainerInspectInfo } = {};

let DockerEvents = require('docker-events');
new DockerEvents({ docker })
  .on("connect", function() {
    console.log("connected to docker api");
  })
  .on("disconnect", function() {
    console.log("disconnected from docker api");
  })
  .on('start', function(data: any) {
    docker.getContainer(data.id).inspect(function(err, inspect) {
      runningContainers[data.id] = inspect;
    });
  })
  .on('die', function(data: any) {
    delete runningContainers[data.id];
  })
  .start();

docker.listContainers({all: false}, function(err, containers) {
  if (err) {
    console.log('ERR: ' + err); 
    return;
  }

  for (let container of containers) {
    if (container.State !== 'running') {
      console.log('not running ' + container.Id);
      continue;
    }

    docker.getContainer(container.Id).inspect(function(err, inspect) {
      runningContainers[container.Id] = inspect;
    });
  }
});
