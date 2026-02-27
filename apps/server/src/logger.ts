import bunyan from "bunyan";

const log = bunyan.createLogger({
  name: "dorkfun-server",
  level: (process.env.LOG_LEVEL as bunyan.LogLevelString) || "info",
});

export default log;
