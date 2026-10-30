import { bindRuntime } from "../shared/runtime.js";
import { mediaEvents, Preflight } from "./component.js";
import { MediaController } from "./controller.js";
import "../style.css";

const app = new Preflight();
app.drivers = bindRuntime(app, new MediaController(), mediaEvents);
document.getElementById("app")?.replaceChildren(app);
