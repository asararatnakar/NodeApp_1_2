# balance-transfer sample with Fabric V1.2 software

Added the following functionality :

* Enabled Mutual TLS 
* Kafka based Orderering Service Node (OSN)
* 'AND' endorsement policy (Read a file pass it to the instantiate/upgrade request)
* Used REST based configtxlator for channel creation
* Upgrade chaincode

TODO :
* Update Anchor peers using channel config update
* add support for couchdb Indexes
* Add private DB support + collections
* Service Discovery