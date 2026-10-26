@description('Region where Linux App Service F1 is available. No paid fallback is permitted.')
param location string = resourceGroup().location

@minLength(2)
@maxLength(40)
@description('Globally unique Web App name, using letters, numbers and hyphens.')
param appName string

@secure()
@description('Runtime secrets/settings; supply through an ignored local parameter file. See deploy/azure-demo.env.example.')
param demoSettings object

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: '${appName}-free'
  location: location
  kind: 'linux'
  sku: { name: 'F1', tier: 'Free', capacity: 1 }
  properties: { reserved: true }
}

resource app 'Microsoft.Web/sites@2024-11-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node scripts/start-demo.mjs'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
    }
  }
}

resource settings 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: app
  name: 'appsettings'
  properties: union(demoSettings, {
    NODE_ENV: 'production'
    HOSTED_DEMO: 'true'
    PROTOTYPE_MODE: 'true'
    WEB_URL: 'https://${app.properties.defaultHostName}'
    API_URL: 'http://127.0.0.1:3051'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    NEXT_TELEMETRY_DISABLED: '1'
  })
}

resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}
resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}

output webUrl string = 'https://${app.properties.defaultHostName}'
output planId string = plan.id
