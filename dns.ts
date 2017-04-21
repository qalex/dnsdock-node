// --
// DNS Part
// --

const ttl = 0;
const dnsPort = 53;

import NodeNamed = require('node-named');
import { ARecord, AAAARecord, CNAMERecord, MXRecord, SOARecord, SRVRecord, TXTRecord } from 'node-named';
import { runningContainers } from './docker';


let forwardDns;
if (process.env.DNS_SERVER) {
  forwardDns = require('dns');
  forwardDns.setServers([process.env.DNS_SERVER]);
}

const nameserver = NodeNamed.createServer();
nameserver
  .on('query', function(query) {
    let domain: string = query.name();
    console.log('DNS Query: %s type %s', domain, query.type());

    if (domain.endsWith('.docker')) {
      if (query.type() !== 'A') {
        nameserver.send(query);
        return;
      }

      let fqdns = Object.keys(runningContainers)
        .reduce((obj, id) => Object.assign(obj, getContainerFQDNs(runningContainers[id])), {});

      let ip = fqdns[domain];
      if (ip) {
        query.addAnswer(domain, new ARecord(ip), ttl);
      }
      
      nameserver.send(query);
    } else {
      if (forwardDns) {
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
function forward(query) {
  interface MxRecord {
      exchange: string,
      priority: number
  }

  let domain = query.name();
  let type = query.type();
  
  forwardDns.resolve(domain, type, function(err: Error, addresses: string[] | MxRecord[] | string[][] | Object) {
    if (err) {
      //console.log(err);
      nameserver.send(query);
      return;
    }

    //console.log(addresses);

    switch (type) {
      case 'A':
          (<string[]>addresses).forEach(addr => query.addAnswer(domain, new ARecord(addr), ttl));
          break;
      case 'AAAA':
          (<string[]>addresses).forEach(addr => query.addAnswer(domain, new AAAARecord(addr), ttl));
          break;
      case 'CNAME':
          (<string[]>addresses).forEach(addr => query.addAnswer(domain, new CNAMERecord(addr), ttl));
          break;
      case 'MX':
          (<MxRecord[]>addresses).forEach(mx => query.addAnswer(domain,
              new MXRecord(mx.exchange, {priority: mx.priority}), ttl));
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

  return Object.keys(networks).reduce((obj, network) => {
    let fqdn = name + "." + image + "." + network + ".docker";
    fqdn = fqdn.replace(/_/g, "-");

    obj[fqdn] = networks[network].IPAddress; 
    return obj;
  }, {});
}
