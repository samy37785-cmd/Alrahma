import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const upstreamApiOrigin =
  process.env["UPSTREAM_API_ORIGIN"] ??
  "https://academy-backend-cxso.onrender.com";

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

app.use("/api", router);

app.use(
  "/api",
  express.raw({ type: () => true, limit: "5mb" }),
  async (req, res) => {
    const target = new URL(req.originalUrl, upstreamApiOrigin);
    const headers = new Headers();

    for (const [name, value] of Object.entries(req.headers)) {
      if (
        value === undefined ||
        ["host", "connection", "content-length", "origin"].includes(
          name.toLowerCase(),
        )
      ) {
        continue;
      }
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }

    headers.set("x-forwarded-host", req.get("host") ?? "");
    headers.set("x-forwarded-proto", req.protocol);

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : (req.body as Buffer),
        redirect: "manual",
      });

      for (const [name, value] of upstream.headers.entries()) {
        if (
          ["connection", "content-length", "content-encoding", "transfer-encoding", "set-cookie"].includes(
            name.toLowerCase(),
          )
        ) {
          continue;
        }
        res.setHeader(name, value);
      }

      const setCookies = upstream.headers.getSetCookie();
      if (setCookies.length > 0) {
        res.setHeader("set-cookie", setCookies);
      }

      res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      req.log.error({ err: error, target: target.toString() }, "Upstream API request failed");
      res.status(502).json({
        message: "The academy service is temporarily unavailable. Please try again.",
      });
    }
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export default app;
