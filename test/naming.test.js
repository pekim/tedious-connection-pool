var assert = require('assert');
var Connection = require('tedious').Connection;

describe('Connection', function () {
    it('Name Collision', function () {
        assert(!Connection.prototype.release);

        var con = new Connection({});
        assert(!con.pool);
        con.close();
    });
});
