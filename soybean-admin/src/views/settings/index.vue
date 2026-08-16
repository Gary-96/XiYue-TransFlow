<script setup lang="ts">
import { ref } from 'vue';
import { NCard, NForm, NFormItem, NInput, NInputNumber, NButton, NSpace, NTag, useMessage } from 'naive-ui';

const message = useMessage();

// 系统配置
const systemConfig = ref({
  // API 配置
  apiKey: 'sk-leman-xxxx-xxxx-xxxx',
  apiSecret: 'xxxxxxxxxxxxxxxxxxxxxxxx',
  apiBaseURL: 'https://api.leman.com/v1',
  
  // 翻译配置
  asrModel: 'whisper-large-v3',
  translationModel: 'gemini-2.0-flash',
  ttsVoice: 'zh-CN-XiaoxiaoNeural',
  
  // 性能配置
  maxConcurrent: 10,
  timeout: 30000,
  retryCount: 3,
  
  // 价格配置
  pricePerMinute: 0.5,
  freeQuota: 60,
  
  // 卡密配置
  licensePrefix: 'LM',
  defaultExpireDays: 365,
  keyLength: 16
});

// 保存配置
function handleSave() {
  message.success('配置保存成功');
  console.log('保存的配置:', systemConfig.value);
}

// 测试连接
async function handleTestConnection() {
  message.loading('正在测试连接...', { duration: 0 });
  await new Promise(resolve => setTimeout(resolve, 1000));
  message.success('连接测试成功');
}
</script>

<template>
  <div class="p-16px">
    <NSpace vertical :size="16">
      <!-- API 配置 -->
      <NCard :bordered="false" title="API 配置">
        <NForm :model="systemConfig" label-placement="left" label-width="120">
          <NFormItem label="API Key">
            <NInput v-model:value="systemConfig.apiKey" placeholder="请输入 API Key" />
          </NFormItem>
          <NFormItem label="API Secret">
            <NInput v-model:value="systemConfig.apiSecret" type="password" placeholder="请输入 API Secret" show-password-on="click" />
          </NFormItem>
          <NFormItem label="API 地址">
            <NInput v-model:value="systemConfig.apiBaseURL" placeholder="https://api.example.com" />
          </NFormItem>
          <NFormItem>
            <NButton type="primary" @click="handleTestConnection">测试连接</NButton>
          </NFormItem>
        </NForm>
      </NCard>

      <!-- 翻译配置 -->
      <NCard :bordered="false" title="翻译配置">
        <NForm :model="systemConfig" label-placement="left" label-width="120">
          <NFormItem label="ASR 模型">
            <NInput v-model:value="systemConfig.asrModel" placeholder="whisper-large-v3" />
          </NFormItem>
          <NFormItem label="翻译模型">
            <NInput v-model:value="systemConfig.translationModel" placeholder="gemini-2.0-flash" />
          </NFormItem>
          <NFormItem label="TTS 语音">
            <NInput v-model:value="systemConfig.ttsVoice" placeholder="zh-CN-XiaoxiaoNeural" />
          </NFormItem>
        </NForm>
      </NCard>

      <!-- 性能配置 -->
      <NCard :bordered="false" title="性能配置">
        <NForm :model="systemConfig" label-placement="left" label-width="120">
          <NFormItem label="最大并发数">
            <NInputNumber v-model:value="systemConfig.maxConcurrent" :min="1" :max="50" />
          </NFormItem>
          <NFormItem label="超时时间(ms)">
            <NInputNumber v-model:value="systemConfig.timeout" :min="1000" :max="60000" step="1000" />
          </NFormItem>
          <NFormItem label="重试次数">
            <NInputNumber v-model:value="systemConfig.retryCount" :min="0" :max="10" />
          </NFormItem>
        </NForm>
      </NCard>

      <!-- 价格配置 -->
      <NCard :bordered="false" title="价格配置">
        <NForm :model="systemConfig" label-placement="left" label-width="120">
          <NFormItem label="每分钟价格(元)">
            <NInputNumber v-model:value="systemConfig.pricePerMinute" :min="0" :max="100" :precision="2" />
          </NFormItem>
          <NFormItem label="免费额度(分钟)">
            <NInputNumber v-model:value="systemConfig.freeQuota" :min="0" :max="600" />
          </NFormItem>
        </NForm>
      </NCard>

      <!-- 卡密配置 -->
      <NCard :bordered="false" title="卡密配置">
        <NForm :model="systemConfig" label-placement="left" label-width="120">
          <NFormItem label="卡密前缀">
            <NInput v-model:value="systemConfig.licensePrefix" maxlength="10" />
          </NFormItem>
          <NFormItem label="默认有效期(天)">
            <NInputNumber v-model:value="systemConfig.defaultExpireDays" :min="1" :max="3650" />
          </NFormItem>
          <NFormItem label="卡密长度">
            <NInputNumber v-model:value="systemConfig.keyLength" :min="8" :max="32" :step="4" />
          </NFormItem>
        </NForm>
      </NCard>

      <!-- 操作按钮 -->
      <NSpace>
        <NButton type="primary" size="large" @click="handleSave">
          保存配置
        </NButton>
        <NButton size="large" @click="systemConfig = {
          apiKey: 'sk-leman-xxxx-xxxx-xxxx',
          apiSecret: 'xxxxxxxxxxxxxxxxxxxxxxxx',
          apiBaseURL: 'https://api.leman.com/v1',
          asrModel: 'whisper-large-v3',
          translationModel: 'gemini-2.0-flash',
          ttsVoice: 'zh-CN-XiaoxiaoNeural',
          maxConcurrent: 10,
          timeout: 30000,
          retryCount: 3,
          pricePerMinute: 0.5,
          freeQuota: 60,
          licensePrefix: 'LM',
          defaultExpireDays: 365,
          keyLength: 16
        }">
          重置默认
        </NButton>
      </NSpace>
    </NSpace>
  </div>
</template>

<style scoped>
</style>
