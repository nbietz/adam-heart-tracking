const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = [
  // Main process
  {
    mode: process.env.NODE_ENV || 'development',
    entry: './src/main/main.ts',
    target: 'electron-main',
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    output: {
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist/main'),
      clean: false
    },
    node: {
      __dirname: false,
      __filename: false
    },
    externals: {
      '@abandonware/noble': 'commonjs @abandonware/noble',
      '@abandonware/bluetooth-hci-socket': 'commonjs @abandonware/bluetooth-hci-socket',
      'bufferutil': 'commonjs bufferutil',
      'utf-8-validate': 'commonjs utf-8-validate'
    }
  },
  // Renderer process
  {
    mode: process.env.NODE_ENV || 'development',
    entry: './src/renderer/index.tsx',
    target: 'electron-renderer',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|obj|mtl|mp4|mov|webm)$/,
          type: 'asset/resource'
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    output: {
      filename: 'renderer.js',
      path: path.resolve(__dirname, 'dist/renderer'),
      clean: false
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html'
      })
    ],
    node: {
      __dirname: false,
      __filename: false
    },
    devServer: {
      port: 8080,
      hot: true,
      static: [
        {
          directory: path.join(__dirname, 'assets'),
          publicPath: '/assets',
          watch: false
        }
      ]
    }
  }
];
