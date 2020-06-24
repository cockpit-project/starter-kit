const path = require("path");
const copy = require("copy-webpack-plugin");
const extract = require("mini-css-extract-plugin");
const fs = require("fs");
const webpack = require("webpack");
const CompressionPlugin = require("compression-webpack-plugin");

var externals = {
    "cockpit": "cockpit",
};

/* These can be overridden, typically from the Makefile.am */
const srcdir = (process.env.SRCDIR || __dirname) + path.sep + "src";
const builddir = (process.env.SRCDIR || __dirname);
const distdir = builddir + path.sep + "dist";
const section = process.env.ONLYDIR || null;
const libdir = path.resolve(srcdir, "pkg" + path.sep + "lib");
const nodedir = path.resolve((process.env.SRCDIR || __dirname), "node_modules");

/* A standard nodejs and webpack pattern */
var production = process.env.NODE_ENV === 'production';

var info = {
    entries: {
        "recordings": [
            "./recordings.jsx",
        ],
        "config": [
            "./config.jsx",
        ]
    },
    files: [
        "index.html",
        "config.html",
        "player.jsx",
        "player.css",
        "recordings.jsx",
        "manifest.json",
        "timer.css",
    ],
};

var output = {
    path: distdir,
    filename: "[name].js",
    sourceMapFilename: "[file].map",
};

/*
 * Note that we're avoiding the use of path.join as webpack and nodejs
 * want relative paths that start with ./ explicitly.
 *
 * In addition we mimic the VPATH style functionality of GNU Makefile
 * where we first check builddir, and then srcdir.
 */

function vpath(/* ... */) {
    var filename = Array.prototype.join.call(arguments, path.sep);
    var expanded = builddir + path.sep + filename;
    if (fs.existsSync(expanded))
        return expanded;
    expanded = srcdir + path.sep + filename;
    return expanded;
}

/* Qualify all the paths in entries */
Object.keys(info.entries).forEach(function(key) {
    if (section && key.indexOf(section) !== 0) {
        delete info.entries[key];
        return;
    }

    info.entries[key] = info.entries[key].map(function(value) {
        if (value.indexOf("/") === -1)
            return value;
        else
            return vpath(value);
    });
});

/* Qualify all the paths in files listed */
var files = [];
info.files.forEach(function(value) {
    if (!section || value.indexOf(section) === 0)
        files.push({ from: vpath("src", value), to: value });
});
info.files = files;

var plugins = [
    new copy(info.files),
    new extract({filename: "[name].css"})
];

/* Only minimize when in production mode */
if (production) {
    /* Rename output files when minimizing */
    output.filename = "[name].min.js";

    plugins.unshift(new CompressionPlugin({
        asset: "[path].gz[query]",
        test: /\.(js|html)$/,
        minRatio: 0.9,
        deleteOriginalAssets: true
    }));
}

module.exports = {
    mode: production ? 'production' : 'development',
    entry: info.entries,
    externals: externals,
    output: output,
    devtool: "source-map",
    resolve: {
        alias: {
            "fs": path.resolve(nodedir, "fs-extra"),
            "font-awesome": path.resolve(nodedir, 'font-awesome-sass/assets/stylesheets'),
        },
        modules: [libdir, nodedir],
    },
    module: {
        rules: [
            {
                enforce: 'pre',
                exclude: /node_modules/,
                loader: 'eslint-loader',
                test: /\.jsx$/
            },
            {
                enforce: 'pre',
                exclude: /node_modules/,
                loader: 'eslint-loader',
                test: /\.es6$/
            },
            {
                exclude: /node_modules/,
                loader: 'babel-loader',
                test: /\.js$/
            },
            {
                exclude: /node_modules/,
                loader: 'babel-loader',
                test: /\.jsx$/
            },
            {
                exclude: /node_modules/,
                loader: 'babel-loader',
                test: /\.es6$/
            },
            {
                test: /\.less$/,
                use: [
                    extract.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            url: false
                        }
                    },
                    "less-loader"
                ]
            },
            /* HACK: remove unwanted fonts from PatternFly's css */
            {
                test: /patternfly-cockpit.scss$/,
                use: [
                    extract.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            url: false,
                        },
                    },
                    {
                        loader: 'string-replace-loader',
                        options: {
                            multiple: [
                                {
                                    search: /src:url[(]"patternfly-icons-fake-path\/glyphicons-halflings-regular[^}]*/g,
                                    replace: 'font-display:block; src:url("../base1/fonts/glyphicons.woff") format("woff");',
                                },
                                {
                                    search: /src:url[(]"patternfly-fonts-fake-path\/PatternFlyIcons[^}]*/g,
                                    replace: 'src:url("../base1/fonts/patternfly.woff") format("woff");',
                                },
                                {
                                    search: /src:url[(]"patternfly-fonts-fake-path\/fontawesome[^}]*/,
                                    replace: 'font-display:block; src:url("../base1/fonts/fontawesome.woff?v=4.2.0") format("woff");',
                                },
                                {
                                    search: /src:url\("patternfly-icons-fake-path\/pficon[^}]*/g,
                                    replace: 'src:url("../base1/fonts/patternfly.woff") format("woff");',
                                },
                                {
                                    search: /@font-face[^}]*patternfly-fonts-fake-path[^}]*}/g,
                                    replace: '',
                                },
                            ]
                        },
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sassOptions: {
                                includePaths: [
                                    // Teach webpack to resolve these references in order to build PF3 scss
                                    path.resolve(nodedir, 'font-awesome-sass', 'assets', 'stylesheets'),
                                    path.resolve(nodedir, 'patternfly', 'dist', 'sass'),
                                    path.resolve(nodedir, 'bootstrap-sass', 'assets', 'stylesheets'),
                                ],
                                outputStyle: 'compressed',
                            },
                        },
                    },
                ]
            },
            {
                test: /\.s?css$/,
                exclude: /patternfly-cockpit.scss/,
                use: [
                    extract.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            url: false
                        }
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sassOptions: {
                                outputStyle: 'compressed',
                            }
                        }
                    },
                ]
            },
        ]
    },
    plugins: plugins
}
