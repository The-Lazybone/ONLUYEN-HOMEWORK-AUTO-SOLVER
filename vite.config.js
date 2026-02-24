import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
    plugins: [
        monkey({
            entry: 'src/main.js',
            userscript: {
                name: 'Intelligent AI Homework Solver (test - channel)',
                namespace: 'https://github.com/The-Lazybone/ONLUYEN-HOMEWORK-AUTO-SOLVER',
                version: '2.1.0',
                description: 'Advanced AI-powered homework solver for onluyen.vn',
                author: 'The-Lazybone',
                match: ['https://*.onluyen.vn/*'],
                icon: 'https://www.google.com/s2/favicons?sz=64&domain=onluyen.vn',
                grant: ['none'],
                require: ['https://cdnjs.cloudflare.com/ajax/libs/mathjs/14.0.1/math.js'],
                updateURL: 'https://github.com/The-Lazybone/ONLUYEN-HOMEWORK-AUTO-SOLVER/raw/main/dist/solver.user.js',
                downloadURL: 'https://github.com/The-Lazybone/ONLUYEN-HOMEWORK-AUTO-SOLVER/raw/main/dist/solver.user.js',
            },
            build: {
                fileName: 'solver.user.js',
            },
        }),
    ],
});
