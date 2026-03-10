import path, { dirname } from "path";
import nodeExternals from "webpack-node-externals";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  mode: "development",
  target: "node",
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.cjs",
    clean: true,
  },
  externalsPresets: { node: true },
  // Do not bundle node_modules. Let Node resolve them at runtime.
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    extensionAlias: {
      ".js": [".ts"],
    },
  },
  devtool: "source-map",
};
