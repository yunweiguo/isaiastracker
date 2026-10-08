import { refreshWeather } from "../src/lib/indexnow";
console.log(JSON.stringify(await refreshWeather()));
