// Borrowed from https://github.com/ajweeks/FlexEngine

#version 450

#extension GL_GOOGLE_include_directive: enable
#include "misc.inc"

layout (location = 0) out float fragColour;

layout (location = 0) in vec2 ex_TexCoord;

layout (binding = 0) uniform UBOConstant
{
	mat4 projection;
	mat4 invProj;
	// SSAO Gen Data
	vec4 samples[SSAO_KERNEL_SIZE];
	float ssaoRadius;
} uboConstant;

layout (binding = 1) uniform sampler2D in_Depth;
layout (binding = 2) uniform sampler2D in_Normal;
layout (binding = 3) uniform sampler2D in_Noise;

vec3 reconstructVSPosFromDepth(vec2 uv)
{
	float depth = texture(in_Depth, uv).r;
	float x = uv.x * 2.0f - 1.0f;
	float y = (1.0f - uv.y) * 2.0f - 1.0f;
	vec4 pos = vec4(x, y, depth, 1.0f);
	vec4 posVS = uboConstant.invProj * pos;
	vec3 posNDC = posVS.xyz / posVS.w;
	return posNDC;
}

void main()
{
    float depth = texture(in_Depth, ex_TexCoord).r;
	
	if (depth == 0.0f)
	{
		fragColour = 1.0f;
		return;
	}

	vec3 normal = normalize(texture(in_Normal, ex_TexCoord).rgb * 2.0f - 1.0f);

	vec3 posVS = reconstructVSPosFromDepth(ex_TexCoord);

	ivec2 depthTexSize = textureSize(in_Depth, 0); 
	ivec2 noiseTexSize = textureSize(in_Noise, 0);
	float renderScale = 0.5; // SSAO is rendered at 0.5x scale
	vec2 noiseUV = vec2(float(depthTexSize.x)/float(noiseTexSize.x), float(depthTexSize.y)/float(noiseTexSize.y)) * ex_TexCoord * renderScale;
	// noiseUV += vec2(0.5);
	vec3 randomVec = texture(in_Noise, noiseUV).xyz;
	
	vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
	vec3 bitangent = cross(tangent, normal);
	mat3 TBN = mat3(tangent, bitangent, normal);

	float bias = 0.01f;

	float occlusion = 0.0f;
	int sampleCount = 0;
	for (uint i = 0; i < SSAO_KERNEL_SIZE; i++)
	{
		vec3 samplePos = TBN * uboConstant.samples[i].xyz;
		samplePos = posVS + samplePos * uboConstant.ssaoRadius; 

		vec4 offset = vec4(samplePos, 1.0f);
		offset = uboConstant.projection * offset;
		offset.xy /= offset.w;
		offset.xy = offset.xy * 0.5f + 0.5f;
		offset.y = 1.0f - offset.y;
		
		vec3 reconstructedPos = reconstructVSPosFromDepth(offset.xy);
		vec3 sampledNormal = normalize(texture(in_Normal, offset.xy).xyz * 2.0f - 1.0f);
		if (dot(sampledNormal, normal) > 0.99)
		{
			++sampleCount;
		}
		else
		{
			float rangeCheck = smoothstep(0.0f, 1.0f, uboConstant.ssaoRadius / abs(reconstructedPos.z - samplePos.z - bias));
			occlusion += (reconstructedPos.z <= samplePos.z - bias ? 1.0f : 0.0f) * rangeCheck;
			++sampleCount;
		}
	}
	occlusion = 1.0 - (occlusion / float(max(sampleCount,1)));
	
	fragColour = occlusion;
}