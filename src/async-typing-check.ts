import {defineHttpHandler} from '@jetbrains/youtrack-scripting-api/apps';
import { withStore } from '@jetbrains/youtrack-apps-tools/dx/runtime';

type MyStore = {
    count: number;
    label: string
}

// Form A — explicit <S, AK>
const a = defineHttpHandler<MyStore, 'onTick' | 'onDone'>({
    endpoints: [{
        scope: 'global', method: 'POST', path: '/tick',
        handle: (ctx) => {
            ctx.store('count', 1);          // typed: number
            ctx.invokeAsync('onTick');      // narrowed
            // ctx.invokeAsync('typo');     // <- uncomment, expect tsc error
            ctx.response.json({});
        }
    }],
    asyncFunctions: {
        onTick: (ctx) => {
            console.log(ctx.load('count'));
        },
        onDone: (ctx) => {
            console.log(ctx);
        }
    }
});

// Form B — curry, AK inferred
const b = withStore<MyStore>()({
    endpoints: [{
        scope: 'global', method: 'POST', path: '/tick',
        handle: (ctx) => {
            ctx.store('label', 'x');        // typed: string
            ctx.invokeAsync('onTick');      // narrowed from asyncFunctions
            // ctx.invokeAsync('typo');     // <- uncomment, expect tsc error
            ctx.response.json({});
        }
    }],
    asyncFunctions: {
        onTick: (ctx) => {
            console.log(ctx.load('label'));
        }
    }
});

console.log(a, b);