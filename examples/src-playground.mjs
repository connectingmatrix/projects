import { Projects } from './index.js'; const p=Projects.create({name:'demo',files:{'index.ts':'console.log(1)'}}); console.log(await Projects.run(p.id));
