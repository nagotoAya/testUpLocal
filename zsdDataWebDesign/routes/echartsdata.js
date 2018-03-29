var express = require('express');
var router = express.Router();
//创建zk
var zookeeper = require('node-zookeeper-client');
//代理
var httpProxy = require('http-proxy');
//
var cluster = require('cluster');
//操作系统
var os = require('os');
//
//var dot = require('dot');
//获取cpu内核数
var osCpus = os.cpus().length;
//缓存
var cache = {};
//端口地址
var PORT = 1234;
//集群地址
var CONNECTION_STRING = '192.168.0.182:2181,192.168.0.182:2182,192.168.0.182:2183';
var REGISTRY_ROOT = '/echartsServer';
//创建zk客户端
var zk = zookeeper.createClient(CONNECTION_STRING);
zk.connect();

//创建代理
var proxy = httpProxy.createProxyServer();
//创建代理服务器对象并监听错误事件
proxy.on('error', function (err, req, res) {
    //输出空白响应数据
    res.end();
})
//启动web服务器
var app = express();
app.use(express.static('public'));
app.all('*', function (req, res) {
    //处理图标请求
    if (req.path == '/favicon.ico') {
        res.end();
        return;
    }
    //获取服务名称
    var serviceName = req.get('Service-Name');
    console.log('serviceName : %s', serviceName);
    if (!serviceName) {
        console.log('Service-Name request header is not exists');
        res.end();
        return;
    }
    //获取服务路径
    var servicePath = REGISTRY_ROOT + "/" + serviceName;
    console.log('servicePath : %s', servicePath);
    //获取服务路径下的地址节点
    zk.getChildren(servicePath, function (error, addressNodes) {
        if (error) {
            console.log('zk.getChildren : %s', error.stack);
            res.end();
            return;
        }
        var size = addressNodes.length;
        if (size == 0) {
            console.log("address node is not exist");
            res.end();
            return;
        }
        //生成地址路径
        var addressPath = servicePath + "/";
        if (size == 1) {
            //若只有一个地址，则获取该地址
            addressPath += addressNodes[0];
        } else {
            //若存在多个地址，则随机获取一个地址
            addressPath += addressNodes[paresInt(Math.random() * size)];
        }
        console.log('addressPath : %s', addressPath);
        //节点改变，重置缓存
        zk.exists(addressPath, function (event) {
            if (event) {
                if (event.NODE_DELETED) {
                    cache = {};
                }
            } else {
                console.log('event is null');
                /*res.end();
                return;*/
            }
        }, function (error, stat) {
            if (error) {
                console.log('An unknown error');
                res.end();
                return;
            }
            if (stat) {
                //获取服务地址
                zk.getData(addressPath, function (error, serviceAddress) {
                    if (error) {
                        console.log('zk.getData : %s', error.stack);
                        res.end();
                        return;
                    }
                    console.log('serviceAddress : %s', serviceAddress);
                    if (!serviceAddress) {
                        console.log('serviceAddress is not exist');
                        res.end();
                        return;
                    }
                    var tmp = cache[serviceName];
                    console.log('cache[serviceName] value is %s', tmp);
                    //从缓存中取出访问地址，没有就缓存地址
                    if (tmp != null || tmp != undefined) {
                        serviceAddress = cache[serviceName];
                        console.log('serviceAddress to get value from cache,cache[serviceName] value is %s', serviceAddress);
                        if (serviceAddress == null || serviceAddress == undefined) {
                            console.log('cache[serviceName] value is %s,returning', serviceAddress);
                            return;
                        }
                    } else {
                        //缓存地址
                        cache[serviceName] = serviceAddress;
                        console.log('serviceAddress save value into cache,cache[serviceName] value is %s', serviceAddress);
                    }
                    var targetUrl = 'http://' + serviceAddress;
                    console.log('targetUrl is %s', targetUrl);
                    //执行反向代理
                    proxy.web(req, res, {
                        //目标地址
                        target: targetUrl
                    });
                });
            }
        });
    });
});
app.listen(PORT, function () {
    console.log('server is running at %d', PORT);
});

module.exports = router;