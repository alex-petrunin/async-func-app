import {defineHttpHandler} from '@jetbrains/youtrack-scripting-api/apps';
import {defineAITool} from '@jetbrains/youtrack-scripting-api/ai-tools';
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

// Form C — AI tool strict <Args, Result, S, AK>
type Args = { query: string };
type AIStore = { last: string };

const c = defineAITool<Args, string, AIStore, 'onDone'>({
    name: 'search', description: 'd',
    execute: (ctx) => {
        ctx.store('last', ctx.arguments.query);   // typed
        ctx.invokeAsync('onDone');                 // narrowed
        // ctx.invokeAsync('typo');                // <- uncomment, expect tsc error
        return 'ok';
    },
    asyncFunctions: {
        onDone: (ctx) => { console.log(ctx.load('last')); }
    }
});

// Form D — AI tool curry <Args, Result, S>() with AK inferred
const d = withStore<Args, string, AIStore>()({
    name: 'search', description: 'd',
    execute: (ctx) => {
        ctx.store('last', ctx.arguments.query);   // typed
        ctx.invokeAsync('onDone');                 // narrowed from asyncFunctions
        // ctx.invokeAsync('typo');                // <- uncomment, expect tsc error
        return 'ok';
    },
    asyncFunctions: {
        onDone: (ctx) => { console.log(ctx.load('last')); }
    }
});

console.log(a, b, c, d);