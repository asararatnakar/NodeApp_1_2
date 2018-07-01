# balance-transfer sample with Fabric V1.2 software

Added the following functionality :

* Enabled Mutual TLS 
* Kafka based Orderering Service Node (OSN)
* 'AND' endorsement policy (customize this)
* Used REST based configtxlator for channel creation

TODO :
* Update Anchor peers using channel config update
* add support for couchdb Indexes
* Add private DB calls
* Service Discovery

This will work when the patch https://gerrit.hyperledger.org/r/#/c/23691/ is merged
