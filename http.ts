let app = require('express')();

import { runningContainers } from './docker';
import { getContainerFQDNs } from './dns';

app.set('view engine', 'pug');
app.get('/', function (req, res) {
  
  let services = Object.keys(runningContainers)
    .map(id => runningContainers[id])
    .map(container => {
      let name = container.Name.substr(1); // remove leading '/'

      let labels: object = container.Config.Labels;
      let urlLabels = Object.keys(labels).filter(label => label.startsWith('url.'))
       
      let service = {};
      service[name] = [];
      if (urlLabels.length == 0) {
        return service;
      }

      let FQDNs = getContainerFQDNs(container);
      
      service[name] = urlLabels
          .filter(label => label.startsWith('url.context'))
          .map(label => {
            let urlId = label.replace("url.context.", "");
            let port: string = labels["url.port." + urlId];
            let context: string = labels[label];
            
            return Object.keys(FQDNs)
                .map(fqdn => 
                          "http://" +
                          fqdn +
                          (port ? ":" + port : "") +
                          context);
          })
          .reduce((a,b) => a.concat(b));
      return service;
    }).reduce((a,b) => Object.assign(a, b));

  res.render('index', { services });
});

app.listen(3000, function () {
  console.log('app listening on port 3000!')
});
