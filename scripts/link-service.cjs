const fs = require('fs');
const path = require('path');
const os = require('os');

const configPath = path.join(os.homedir(), '.railway', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const projKey = Object.keys(config.projects).find(k => k.includes('aerosentinel'));

if (projKey) {
  config.projects[projKey].service = 'b4946134-9fdc-42a9-a2d9-cd139f121480';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Updated Railway config to link api-server-preview service');
  console.log('Service:', config.projects[projKey].service);
  console.log('Environment:', config.projects[projKey].environmentName);
} else {
  console.log('Project not found in config');
}
