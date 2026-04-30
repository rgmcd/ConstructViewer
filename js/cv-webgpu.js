/* jshint bitwise: false, curly: true, eqeqeq: true, esversion: 8 */
var constructViewerWebGPU = constructViewerWebGPU || (function (win) {
    "use strict";

    const shaderSource = `
        struct Uniforms {
            canvasSize: vec2f,
        };

        struct VertexInput {
            @location(0) position: vec2f,
            @location(1) texCoord: vec2f,
            @location(2) characterCoord: vec2f,
            @location(3) pixelColor: vec4f,
            @location(4) packetPosition: vec2f,
        };

        struct VertexOutput {
            @builtin(position) position: vec4f,
            @location(0) texCoord: vec2f,
            @location(1) pixelColor: vec4f,
        };

        @group(0) @binding(0) var spriteSampler: sampler;
        @group(0) @binding(1) var spriteTexture: texture_2d<f32>;
        @group(0) @binding(2) var<uniform> uniforms: Uniforms;

        @vertex
        fn vertexMain(input: VertexInput) -> VertexOutput {
            let pixelPosition = input.position + input.packetPosition;
            let clipPosition = vec2f(
                pixelPosition.x / uniforms.canvasSize.x * 2.0 - 1.0,
                1.0 - pixelPosition.y / uniforms.canvasSize.y * 2.0
            );

            var output: VertexOutput;
            output.position = vec4f(clipPosition, 0.0, 1.0);
            output.texCoord = input.texCoord + input.characterCoord;
            output.pixelColor = input.pixelColor;
            return output;
        }

        @fragment
        fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
            return textureSample(spriteTexture, spriteSampler, input.texCoord) * input.pixelColor;
        }
    `;

    class Settings {
        constructor(
            fontSize = 20,
            font = "normal " + fontSize + "px 'Courier New', monospace",
            vertPadding = 2,
            colWidth = fontSize + 2,
            speedMin = 2,
            speedMax = 5) {

            this.fontSize = fontSize;
            this.font = font;
            this.vertPadding = vertPadding;
            this.colWidth = colWidth;
            this.speedMin = speedMin;
            this.speedMax = speedMax;
        }
    }

    class Engine {
        constructor(canvas) {
            this.canvas = canvas;
            this.adapter = null;
            this.device = null;
            this.context = null;
            this.format = "";
            this.pipeline = null;
            this.bindGroup = null;
            this.uniformBuffer = null;
            this.vertexBuffer = null;
            this.instanceBuffer = null;
            this.instanceBufferSize = 0;
            this.spriteSheet = null;
        }

        async initialize() {
            if (!navigator.gpu) {
                throw new Error("WebGPU is not available in this browser.");
            }

            this.adapter = await navigator.gpu.requestAdapter({
                powerPreference: "high-performance"
            });

            if (!this.adapter) {
                throw new Error("No compatible GPU adapter was found.");
            }

            this.device = await this.adapter.requestDevice();
            this.context = this.canvas.getContext("webgpu");
            this.format = navigator.gpu.getPreferredCanvasFormat();

            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: "opaque"
            });

            this.uniformBuffer = this.device.createBuffer({
                size: 8,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
        }

        async loadSpriteSheet(sourceCanvas, cols, rows, spriteWidth, spriteHeight) {
            const imageBitmap = await createImageBitmap(sourceCanvas);
            const texture = this.device.createTexture({
                size: [imageBitmap.width, imageBitmap.height],
                format: "rgba8unorm",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });

            this.device.queue.copyExternalImageToTexture(
                { source: imageBitmap },
                { texture: texture },
                [imageBitmap.width, imageBitmap.height]
            );

            const sampler = this.device.createSampler({
                addressModeU: "clamp-to-edge",
                addressModeV: "clamp-to-edge",
                magFilter: "linear",
                minFilter: "linear"
            });

            const normalizedSpriteWidth = spriteWidth / imageBitmap.width;
            const normalizedSpriteHeight = spriteHeight / imageBitmap.height;

            this.spriteSheet = {
                cols: cols,
                rows: rows,
                spriteWidth: spriteWidth,
                spriteHeight: spriteHeight,
                normalizedSpriteWidth: normalizedSpriteWidth,
                normalizedSpriteHeight: normalizedSpriteHeight,
                texture: texture,
                sampler: sampler
            };

            this.createPipeline();
            this.createVertexBuffer();
        }

        createPipeline() {
            const shaderModule = this.device.createShaderModule({
                label: "Construct Viewer WebGPU shader",
                code: shaderSource
            });

            this.pipeline = this.device.createRenderPipeline({
                label: "Construct Viewer glyph pipeline",
                layout: "auto",
                vertex: {
                    module: shaderModule,
                    entryPoint: "vertexMain",
                    buffers: [
                        {
                            arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
                            stepMode: "vertex",
                            attributes: [
                                { shaderLocation: 0, offset: 0, format: "float32x2" },
                                { shaderLocation: 1, offset: 2 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" }
                            ]
                        },
                        {
                            arrayStride: 8 * Float32Array.BYTES_PER_ELEMENT,
                            stepMode: "instance",
                            attributes: [
                                { shaderLocation: 2, offset: 0, format: "float32x2" },
                                { shaderLocation: 3, offset: 2 * Float32Array.BYTES_PER_ELEMENT, format: "float32x4" },
                                { shaderLocation: 4, offset: 6 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" }
                            ]
                        }
                    ]
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: "fragmentMain",
                    targets: [
                        {
                            format: this.format,
                            blend: {
                                color: {
                                    srcFactor: "src-alpha",
                                    dstFactor: "one-minus-src-alpha",
                                    operation: "add"
                                },
                                alpha: {
                                    srcFactor: "one",
                                    dstFactor: "one-minus-src-alpha",
                                    operation: "add"
                                }
                            }
                        }
                    ]
                },
                primitive: {
                    topology: "triangle-list"
                }
            });

            this.bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.spriteSheet.sampler },
                    { binding: 1, resource: this.spriteSheet.texture.createView() },
                    { binding: 2, resource: { buffer: this.uniformBuffer } }
                ]
            });
        }

        createVertexBuffer() {
            const sheet = this.spriteSheet;
            const w = sheet.spriteWidth;
            const h = sheet.spriteHeight;
            const u = sheet.normalizedSpriteWidth;
            const v = sheet.normalizedSpriteHeight;
            const vertexData = new Float32Array([
                0, 0, 0, 0,
                w, 0, u, 0,
                0, h, 0, v,
                0, h, 0, v,
                w, 0, u, 0,
                w, h, u, v
            ]);

            this.vertexBuffer = this.device.createBuffer({
                size: vertexData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
            this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);
        }

        ensureInstanceBuffer(byteLength) {
            if (this.instanceBuffer && this.instanceBufferSize >= byteLength) {
                return;
            }

            this.instanceBufferSize = Math.max(byteLength, this.instanceBufferSize * 2, 4096);
            this.instanceBuffer = this.device.createBuffer({
                size: this.instanceBufferSize,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
        }

        render(packets) {
            if (!this.spriteSheet || !this.pipeline) {
                return;
            }

            const sheet = this.spriteSheet;
            const floatsPerInstance = 8;
            const instanceData = new Float32Array(packets.length * floatsPerInstance);
            let packetsDrawn = 0;

            for (let i = 0; i < packets.length; i++) {
                const packet = packets[i];
                if (packet.y > -settings.fontSize && packet.y <= view.height) {
                    const bufferIndex = packetsDrawn * floatsPerInstance;
                    instanceData[bufferIndex] = packet.index % sheet.cols * sheet.normalizedSpriteWidth;
                    instanceData[bufferIndex + 1] = Math.floor(packet.index / sheet.cols) * sheet.normalizedSpriteHeight;
                    instanceData.set(packet.color, bufferIndex + 2);
                    instanceData[bufferIndex + 6] = packet.stream.x;
                    instanceData[bufferIndex + 7] = packet.y;
                    packetsDrawn++;
                }
            }

            this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([view.width, view.height]));

            const encoder = this.device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.context.getCurrentTexture().createView(),
                        clearValue: { r: 8 / 255, g: 15 / 255, b: 8 / 255, a: 1 },
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ]
            });

            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.bindGroup);
            pass.setVertexBuffer(0, this.vertexBuffer);

            if (packetsDrawn > 0) {
                const byteLength = packetsDrawn * floatsPerInstance * Float32Array.BYTES_PER_ELEMENT;
                this.ensureInstanceBuffer(byteLength);
                this.device.queue.writeBuffer(this.instanceBuffer, 0, instanceData.subarray(0, packetsDrawn * floatsPerInstance));
                pass.setVertexBuffer(1, this.instanceBuffer);
                pass.draw(6, packetsDrawn);
            }

            pass.end();
            this.device.queue.submit([encoder.finish()]);
        }
    }

    class Packet {
        constructor(parent, y) {
            this.stream = parent;
            this.y = y;
            this.flipped = false;
            this.index = -1;
            this.color = new Float32Array([0.0, 250 / 255.0, 65 / 255.0, 0.0]);

            this.assign_char();
        }

        assign_char(index, flipped) {
            if (index !== undefined) {
                this.index = index;
            } else {
                const rnd = randint(1, 100);

                if (rnd <= 20) {
                    this.index = 0;
                } else if (rnd <= 30) {
                    const ord = randint(48, 57);
                    this.index = ord - 48 + 1;
                } else {
                    const ord = randint(12448, 12543);
                    this.index = ord - 12448 + 11;
                }
            }

            if (flipped !== undefined) {
                this.flipped = flipped;
            } else {
                this.flipped = randint(1, 100) <= 5;
            }
        }

        assign_alpha(alpha) {
            if (alpha === 1.0) {
                this.color = new Float32Array([224 / 255.0, 250 / 255.0, 224 / 255.0, 1.0]);
            } else {
                this.color[3] = alpha;
            }
        }
    }

    class Stream {
        constructor(x) {
            this.packets = [];
            this.x = x;

            this.reset_stream_position(true);
        }

        static calcStreamLengthMin() {
            let min = Math.floor(view.height * 0.028);

            if (min < 10) {
                min = 10;
            } else if (min > 20) {
                min = 20;
            }

            return min;
        }

        static calcStreamLengthMax() {
            let max = Math.floor(view.height * 0.111);

            if (max < 50) {
                max = 50;
            } else if (max > 80) {
                max = 80;
            }

            return max;
        }

        reset_stream_position(offset = false) {
            this.speed = randint(settings.speedMin, settings.speedMax);

            let offsetValue = 0;
            if (offset) {
                offsetValue = randint(0, Stream.calcStreamLengthMax());
            }

            this.packets = [];
            const streamLength = randint(Stream.calcStreamLengthMin(), Stream.calcStreamLengthMax());

            for (let i = 0; i < streamLength; i++) {
                this.packets.push(new Packet(this, ((streamLength - 1 + offsetValue) - i) * -(settings.fontSize + settings.vertPadding)));
                this.replacePacket(i);
            }
        }

        update(iter) {
            const alphaMin = 0.05;
            const alphaMax = 1.0;

            if (iter % this.speed === 0) {
                for (let i = 0, ii = this.packets.length; i < ii; i++) {
                    this.packets[i].y += settings.fontSize + settings.vertPadding;

                    if (i < ii - 1) {
                        if (randint(1, 200) === 1) {
                            this.replacePacket(i);
                        } else {
                            this.packets[i].assign_char(this.packets[i + 1].index, this.packets[i + 1].flipped);
                        }
                    } else {
                        this.replacePacket(i);
                    }
                }
            }

            for (let i = 0, ii = this.packets.length; i < ii; i++) {
                const alpha = (i + 1) / ii * (alphaMax - alphaMin) + alphaMin;
                this.packets[i].assign_alpha(alpha);
            }

            if (this.packets[0].y > view.height) {
                this.reset_stream_position();
            }
        }

        replacePacket(i) {
            const packetNum = this.packets.length;

            let okay = false;
            while (!okay) {
                okay = true;
                this.packets[i].assign_char();

                for (let j = i + 1; j < packetNum && j <= i + 4; j++) {
                    if (this.packets[i].index === this.packets[j].index) {
                        okay = false;
                        break;
                    }
                }
            }
        }
    }

    class Construct {
        constructor() {
            this.streams = [];
        }

        viewResized() {
            const displayColumns = this.calcDisplayColumns();

            for (let i = this.streams.length - 1; i >= displayColumns; i--) {
                this.streams.pop();
            }

            for (let i = 0; i < this.streams.length; i++) {
                this.streams[i].x = this.calcX(i);
            }

            for (let i = this.streams.length; i < displayColumns; i++) {
                this.streams.push(new Stream(this.calcX(i)));
            }
        }

        calcDisplayColumns() {
            return Math.floor(view.width / settings.colWidth);
        }

        calcX(column) {
            return column * settings.colWidth;
        }

        setViewFrame(iter) {
            const packets = [];

            for (let i = 0, ii = this.streams.length; i < ii; i++) {
                this.streams[i].update(iter);
                packets.push.apply(packets, this.streams[i].packets);
            }

            engine.render(packets);
        }
    }

    const doc = win.document;
    const view = doc.getElementById("view");
    const settings = new Settings();
    const construct = new Construct();
    const engine = new Engine(view);
    let iter = 0;

    win.addEventListener("load", function () {
        initialize().catch(function (err) {
            console.error(err);
            win.alert(err.message);
        });
    });

    win.addEventListener("resize", function () {
        resizeview();
    });

    async function initialize() {
        await engine.initialize();
        resizeview();

        const chars = [" "];
        let i;

        for (i = 48; i <= 57; i++) {
            chars.push(String.fromCharCode(i));
        }

        for (i = 12448; i <= 12543; i++) {
            chars.push(String.fromCharCode(i));
        }

        await createCharSpriteSheet(chars);
        win.requestAnimationFrame(draw);
    }

    function resizeview() {
        view.width = win.innerWidth;
        view.height = win.innerHeight;
        construct.viewResized();
    }

    function randint(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    async function createCharSpriteSheet(chars) {
        let spriteWidth = -1;
        let spriteHeight = settings.fontSize;
        const ctx = doc.createElement("canvas").getContext("2d");

        ctx.font = settings.font;

        for (let i = 0, ii = chars.length; i < ii; i++) {
            const charSize = ctx.measureText(chars[i]);
            if (spriteWidth < charSize.width) {
                spriteWidth = charSize.width;
            }
        }

        spriteWidth = Math.ceil(spriteWidth);
        spriteHeight = Math.ceil(spriteHeight);

        if (spriteWidth % 2 === 0) {
            spriteWidth += 1;
        }
        if (spriteHeight % 2 === 0) {
            spriteHeight += 1;
        }

        spriteWidth += 2;
        spriteHeight += 2;

        let cols = Math.sqrt(chars.length);
        let rows = cols;
        if (cols - Math.floor(cols) > 0) {
            rows += 1;
        }
        cols = Math.floor(cols);
        rows = Math.floor(rows);

        ctx.canvas.width = cols * spriteWidth;
        ctx.canvas.height = rows * spriteHeight;
        ctx.font = settings.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        for (let i = 0, ii = chars.length; i < ii; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            ctx.fillText(chars[i], col * spriteWidth + spriteWidth / 2, row * spriteHeight + spriteHeight / 2);
        }

        await engine.loadSpriteSheet(ctx.canvas, cols, rows, spriteWidth, spriteHeight);
    }

    function draw() {
        iter++;
        construct.setViewFrame(iter);
        win.requestAnimationFrame(draw);
    }

    return null;
})(window);
