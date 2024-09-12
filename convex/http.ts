import twilio from "./twilio";
import { httpRouter } from "convex/server";

const http = httpRouter();
twilio.registerRoutes(http);
export default http;