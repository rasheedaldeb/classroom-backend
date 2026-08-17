import type { Request, Response, NextFunction } from "express";
import aj from "../config/arcjet.js";
import { ArcjetNodeRequest } from "@arcjet/node";

const securityMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (process.env.NODE_ENV === "test") return next();

  try {
    const arcjetRequest: ArcjetNodeRequest = {
      headers: req.headers,
      method: req.method,
      url: req.originalUrl ?? req.url,
      socket: {
        remoteAddress: req.socket.remoteAddress ?? req.ip ?? "0.0.0.0",
      },
    };

    const decision = await aj.protect(arcjetRequest);

    if (decision.isDenied() && decision.reason.isBot()) {
      return res.status(403).json({ message: "Access denied, bot detected" });
    }

    if (decision.isDenied() && decision.reason.isShield()) {
      return res
        .status(403)
        .json({ message: "Request blocked by security policy" });
    }

    next();
  } catch (e) {
    console.log(`Arcjet Middleware error : ${e} `);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export default securityMiddleware;
