import { HttpsProxyAgent } from 'https-proxy-agent';

const outboundProxy = process.env.HTTPS_PROXY
  || process.env.https_proxy
  || process.env.HTTP_PROXY
  || process.env.http_proxy;

const fredProxy = {
  target: 'https://fred.stlouisfed.org',
  secure: true,
  changeOrigin: true,
  pathRewrite: {
    '^/external/fred': ''
  },
  ...(outboundProxy ? { agent: new HttpsProxyAgent(outboundProxy) } : {}),
  logLevel: 'debug'
};

export default {
  '/api': {
    target: 'http://localhost:9092',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/external/yahoo': {
    target: 'https://query1.finance.yahoo.com',
    secure: true,
    changeOrigin: true,
    pathRewrite: {
      '^/external/yahoo': ''
    },
    logLevel: 'debug'
  },
  '/external/fred': fredProxy,
  '/external/ecb': {
    target: 'https://data-api.ecb.europa.eu',
    secure: true,
    changeOrigin: true,
    pathRewrite: {
      '^/external/ecb': ''
    },
    logLevel: 'debug'
  }
};