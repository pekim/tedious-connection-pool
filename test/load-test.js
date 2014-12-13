var ConnectionPool = require('../lib/connection-pool');
var Request = require('tedious').Request;

var poolConfig = {min: 20, max: 100};
var pool = new ConnectionPool(poolConfig, {
    userName: 'test',
    password: 'test',
    server: 'dev1'
});

var clients = 1000;
var connections = 1000;
var total = clients * connections;

var c = 0;
var p = 0;

var createRequest = function (err, connection) {
    if (err)
        console.error(err);

    if (c >= total)
        return;

    var request = new Request('select 42', function () {
        connection.release();

        c++;
        var m = Math.round(c / total * 100);
        if (m > p) {
            p = m;
            console.log(p);
        }

        //console.log(c);
        if (c === total - 1) {
            console.log('done');
            pool.drain();

            setTimeout(function() {
                process.exit();
            }, 10000);
            return;
        }

        setTimeout(function() {
            pool.acquire(createRequest);
        }, 0);
    });

    request.on('row', function (columns) {
        //console.log(columns[0].value);
    });

    connection.execSql(request);
};

for (var i = 0; i < clients; i++) {
    pool.acquire(createRequest);
}
