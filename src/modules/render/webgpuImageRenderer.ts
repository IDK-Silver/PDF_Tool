type WebGpuImageSource = ImageBitmap | ImageData | HTMLImageElement

type WebGpuState = {
  device: any
  format: string
  pipeline: any
  sampler: any
  bindGroupLayout: any
}

let statePromise: Promise<WebGpuState> | null = null

const shaderSource = `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct Uniforms {
  flags: vec4<f32>,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0)
  );

  var out: VertexOut;
  out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  out.uv = uvs[vertexIndex];
  return out;
}

fn invertHueRotate180(rgb: vec3<f32>) -> vec3<f32> {
  let inverted = vec3<f32>(1.0, 1.0, 1.0) - rgb;
  let rotated = vec3<f32>(
    -0.574 * inverted.r + 1.430 * inverted.g + 0.144 * inverted.b,
     0.426 * inverted.r + 0.430 * inverted.g + 0.144 * inverted.b,
     0.426 * inverted.r + 1.430 * inverted.g - 0.856 * inverted.b
  );
  return clamp(rotated, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fsMain(input: VertexOut) -> @location(0) vec4<f32> {
  let color = textureSample(sourceTexture, sourceSampler, input.uv);
  if (uniforms.flags.x > 0.5) {
    return vec4<f32>(invertHueRotate180(color.rgb), color.a);
  }
  return color;
}
`

function webGpuUsage(name: string): number {
  const usage = (globalThis as any).GPUTextureUsage
  if (!usage || typeof usage[name] !== 'number') {
    throw new Error('WebGPU texture usage constants are unavailable')
  }
  return usage[name]
}

function webGpuBufferUsage(name: string): number {
  const usage = (globalThis as any).GPUBufferUsage
  if (!usage || typeof usage[name] !== 'number') {
    throw new Error('WebGPU buffer usage constants are unavailable')
  }
  return usage[name]
}

function webGpuShaderStage(name: string): number {
  const stage = (globalThis as any).GPUShaderStage
  if (!stage || typeof stage[name] !== 'number') {
    throw new Error('WebGPU shader stage constants are unavailable')
  }
  return stage[name]
}

async function getWebGpuState(): Promise<WebGpuState> {
  if (statePromise) return statePromise

  statePromise = (async () => {
    const gpu = (navigator as any).gpu
    if (!gpu) {
      throw new Error('WebGPU is not available in this WebView')
    }

    const adapter = await gpu.requestAdapter()
    if (!adapter) {
      throw new Error('No WebGPU adapter is available')
    }

    const device = await adapter.requestDevice()
    device.lost?.then(() => {
      statePromise = null
    })

    const format = gpu.getPreferredCanvasFormat()
    const module = device.createShaderModule({ code: shaderSource })
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: webGpuShaderStage('FRAGMENT'),
          texture: {},
        },
        {
          binding: 1,
          visibility: webGpuShaderStage('FRAGMENT'),
          sampler: {},
        },
        {
          binding: 2,
          visibility: webGpuShaderStage('FRAGMENT'),
          buffer: { type: 'uniform' },
        },
      ],
    })
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    })
    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vsMain',
      },
      fragment: {
        module,
        entryPoint: 'fsMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    })

    return { device, format, pipeline, sampler, bindGroupLayout }
  })()

  return statePromise
}

function sourceWidth(source: WebGpuImageSource): number {
  if (source instanceof HTMLImageElement) return source.naturalWidth
  return source.width
}

function sourceHeight(source: WebGpuImageSource): number {
  if (source instanceof HTMLImageElement) return source.naturalHeight
  return source.height
}

function resizeCanvas(canvas: HTMLCanvasElement, source: WebGpuImageSource) {
  const width = Math.max(1, Math.round(sourceWidth(source)))
  const height = Math.max(1, Math.round(sourceHeight(source)))

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

export async function drawWebGpuImage(
  canvas: HTMLCanvasElement,
  source: WebGpuImageSource,
  options: { invert?: boolean } = {},
) {
  const width = sourceWidth(source)
  const height = sourceHeight(source)
  if (width <= 0 || height <= 0) return

  const state = await getWebGpuState()
  const context = canvas.getContext('webgpu') as any
  if (!context) {
    throw new Error('Cannot create a WebGPU canvas context')
  }

  let texture: any | null = null
  let uniformBuffer: any | null = null
  let scopePushed = false

  try {
    state.device.pushErrorScope?.('validation')
    scopePushed = true
    resizeCanvas(canvas, source)
    context.configure({
      device: state.device,
      format: state.format,
      alphaMode: 'premultiplied',
    })

    texture = state.device.createTexture({
      size: [width, height, 1],
      format: 'rgba8unorm',
      usage: webGpuUsage('TEXTURE_BINDING') | webGpuUsage('COPY_DST') | webGpuUsage('RENDER_ATTACHMENT'),
    })
    state.device.queue.copyExternalImageToTexture(
      { source: source as any },
      { texture },
      [width, height],
    )

    uniformBuffer = state.device.createBuffer({
      size: 16,
      usage: webGpuBufferUsage('UNIFORM') | webGpuBufferUsage('COPY_DST'),
    })
    state.device.queue.writeBuffer(
      uniformBuffer,
      0,
      new Float32Array([options.invert ? 1 : 0, 0, 0, 0]),
    )

    const bindGroup = state.device.createBindGroup({
      layout: state.bindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: state.sampler },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    })

    const encoder = state.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })
    pass.setPipeline(state.pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.draw(6)
    pass.end()
    state.device.queue.submit([encoder.finish()])

    await state.device.queue.onSubmittedWorkDone()
    const validationError = await state.device.popErrorScope?.()
    scopePushed = false
    if (validationError) {
      throw new Error(validationError.message || String(validationError))
    }
  } finally {
    if (scopePushed) {
      try { await state.device.popErrorScope?.() } catch {}
    }
    try { texture?.destroy() } catch {}
    try { uniformBuffer?.destroy() } catch {}
  }
}
