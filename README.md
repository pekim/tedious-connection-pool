# tedious-connection-pool
A simple connection pool for [tedious](http://github.com/pekim/tedious).

    Status: Experimental

## Example
The only difference from the regular tedious API is how the connection is obtained.
Once a Connection object has been acquired, the tedious API can be used with the
connection as normal.

```javascript
var ConnectionPool = require('tedious-connection-pool');

var pool = new ConnectionPool(poolConfig, connectionConfig);

pool.requestConnection(function (err, connection) {
  if(!err) {
    var request = new Request('select 42', function(err, rowCount) {
      assert.strictEqual(rowCount, 1);
    
      // Release the connection back to the pool.
      connection.close();
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns[0].value, 42);
    });

    connection.on('connect', function(err) {
      connection.execSql(request);
    });
  }
});
```

When the connection is closed it is returned to the pool.
It is then available to be reused.

##Class: ConnectionPool

### new ConnectionPool(poolConfig, connectionConfig)

* `poolConfig` {Object}
  * `max` {Number} The maximum number of connections there can be in the pool. Default = `10`
  * `min` {Number} The minimun of connections there can be in the pool. Default = `0`
  * `idleTimeoutMillis` {Number} The Number of milliseconds before closing an unused connection. Default = `30000`
  
* `connectionConfig` {Object} The same configuration that would be used to [create a
  tedious Connection](http://pekim.github.com/tedious/api-connection.html#function_newConnection).

### connectionPool.requestConnection(callback)

* `callback` {Function} Callback function
  * `error` {Error Object}
  * `connection` {Object} A [Connection](http://pekim.github.com/tedious/api-connection.html)
