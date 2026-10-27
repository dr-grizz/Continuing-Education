targetScope = 'subscription'

param location string
param resourceGroupName string = 'rg-continuinged-demo'
param appName string = 'cuce-demo'

@secure()
param demoSettings object = {}

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module demo './main.bicep' = {
  name: 'continuinged-demo-app'
  scope: group
  params: {
    appName: appName
    location: location
    demoSettings: demoSettings
  }
}

output webUrl string = demo.outputs.webUrl
output planId string = demo.outputs.planId
output resourceGroupId string = group.id
