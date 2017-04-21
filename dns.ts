// DNS Part

import { runningContainers } from './docker';

const ttl = 0;
const dnsPort = 53;

import dns = require('dns');
let dnsForward = false;
if (process.env.DNS_SERVER) {
  dns.setServers([process.env.DNS_SERVER]);
  dnsForward = true;
} else {
  console.log("Not forwarding queries to any DNS server because DNS_SERVER env variable not set");
}

const NodeNamed = require('node-named');
const nameserver = NodeNamed.createServer();
nameserver
  .on('query', function(query: any) {
    let domain: string = query.name();
    console.log('DNS Query: %s type %s', domain, query.type());

    if (domain.endsWith('.docker')) {
      if (query.type() !== 'A') {
        nameserver.send(query);
        return;
      }

      let fqdns: { [domain:string]:string } = Object.keys(runningContainers)
        .reduce((obj, id) => Object.assign(obj, getContainerFQDNs(runningContainers[id])), {});

      let ip = fqdns[domain];
      if (ip) {
        query.addAnswer(domain, new NodeNamed.ARecord(ip), ttl);
      }
      
      nameserver.send(query);
    } else {
      if (dnsForward) {
        forward(query);
      } else {
        nameserver.send(query); // empty query
      }
    }
  })
  .listen(dnsPort, '::', function() {
    console.log('DNS server started on port ' + dnsPort);
  });

/**
 * 
 * @param query query received
 */
import { MxRecord } from 'dns';
function forward(query: any) {
  let domain = query.name();
  let type = query.type();
  
  dns.resolve(domain, type, function(err: Error, addresses: string[] | MxRecord[] | string[][] | Object) {
    if (err) {
      nameserver.send(query);
      return;
    }

    switch (type) {
      case 'A':
          (addresses as string[]).forEach(addr => query.addAnswer(domain, new NodeNamed.ARecord(addr), ttl));
          break;
      case 'AAAA':
          (addresses as string[]).forEach(addr => query.addAnswer(domain, new NodeNamed.AAAARecord(addr), ttl));
          break;
      case 'CNAME':
          (addresses as string[]).forEach(addr => query.addAnswer(domain, new NodeNamed.CNAMERecord(addr), ttl));
          break;
      case 'MX':
          (addresses as MxRecord[]).forEach(mx => query.addAnswer(domain,
              new NodeNamed.MXRecord(mx.exchange, {priority: mx.priority}), ttl));
          break;
      case 'SOA':
      case 'SRV':
      case 'TXT':
          console.log(type + " not implemented yet");
          break;
    }
    nameserver.send(query);
  });
}

/**
 * Builds a map of FQDNs for a given container 
 * @param container An object representing a result of Container.inspect() call
 */
import { ContainerInspectInfo } from 'dockerode';
export function getContainerFQDNs(container: ContainerInspectInfo) : { [key:string]:string } {
  let name: string = container.Name;
  if (name.startsWith("/")) {
    name = name.substr(1);
  }

  let image: string = container.Config.Image;
  if (image.indexOf(":") > 0) {
    image = image.substr(0, image.indexOf(":"));
  }
  if (image.lastIndexOf("/") > 0) {
    image = image.substr(image.lastIndexOf("/") + 1);
  }

  let networks = container.NetworkSettings.Networks;

  return Object.keys(networks).reduce((obj: {[fqdn:string]:string}, network) => {
    let fqdn = name + "." + image + "." + network + ".docker";
    fqdn = fqdn.replace(/_/g, "-");

    obj[fqdn] = networks[network].IPAddress; 
    return obj;
  }, {});
}
