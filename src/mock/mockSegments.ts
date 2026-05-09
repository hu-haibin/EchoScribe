import type { Segment, MockSize } from '../types';

// 模拟真实口播/复盘场景的句子池
const RAW_SENTENCES = [
  '我们今天主要福利这个投放素材的问题',
  '这个ROI其实比上个月好了不少',
  '然后我们看一下巨量引掣的后台数据',
  '剪应里面那个模板我觉得可以优化一下',
  '这个素材的点击率大概在百分之三左右',
  '我们需要重新调整一下投放策略',
  '接下来看一下竞品的分析报告',
  '这个视频的完播率还是挺高的',
  '我们的目标人群主要是二十五到三十五岁',
  '然后这个落地页的转化率需要提升',
  '上周的直播数据我简单说一下',
  '这个产品的卖点我们要重新提练一下',
  '私域流量这块我们做的还不够',
  '这个账号的粉丝增长速度有点慢',
  '我觉得可以尝试一下信息流广告',
  '这个视频的前三秒很关键',
  '用户的评论里面有一些有价值的反馈',
  '我们看看这个数据看板的趋势',
  '这个活动的参与率超出了我们的预期',
  '短视频的内容方向需要调整一下',
  '这条素材的互动率比较低',
  '我们的客单价大概在两百块左右',
  '然后是关于售后服务的一些问题',
  '这个渠道的获客成本偏高了',
  '我觉得我们应该加大在抖音的投入',
  '这批素材的审核通过率百分之九十',
  '这个这个我重新说一下',
  '嗯让我想一下怎么表达比较好',
  '对对对就是这个意思',
  '然后呢然后呢我们继续往下说',
];

// 对应的"修正后"句子
const EDITED_SENTENCES = [
  '我们今天主要复盘这个投放素材的问题',
  '这个ROI其实比上个月好了不少',
  '然后我们看一下巨量引擎的后台数据',
  '剪映里面那个模板我觉得可以优化一下',
  '这个素材的点击率大概在百分之三左右',
  '我们需要重新调整一下投放策略',
  '接下来看一下竞品的分析报告',
  '这个视频的完播率还是挺高的',
  '我们的目标人群主要是二十五到三十五岁',
  '然后这个落地页的转化率需要提升',
  '上周的直播数据我简单说一下',
  '这个产品的卖点我们要重新提炼一下',
  '私域流量这块我们做的还不够',
  '这个账号的粉丝增长速度有点慢',
  '我觉得可以尝试一下信息流广告',
  '这个视频的前三秒很关键',
  '用户的评论里面有一些有价值的反馈',
  '我们看看这个数据看板的趋势',
  '这个活动的参与率超出了我们的预期',
  '短视频的内容方向需要调整一下',
  '这条素材的互动率比较低',
  '我们的客单价大概在两百块左右',
  '然后是关于售后服务的一些问题',
  '这个渠道的获客成本偏高了',
  '我觉得我们应该加大在抖音的投入',
  '这批素材的审核通过率百分之九十',
  '这个这个我重新说一下',
  '嗯让我想一下怎么表达比较好',
  '对对对就是这个意思',
  '然后呢然后呢我们继续往下说',
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export function generateMockSegments(count: MockSize): Segment[] {
  const rand = seededRandom(42);
  const segments: Segment[] = [];
  let currentTime = 0;

  for (let i = 0; i < count; i++) {
    const duration = 2.5 + rand() * 6; // 2.5~8.5 秒
    const gap = rand() * 0.3;           // 0~0.3 秒间隔
    const start = currentTime + gap;
    const end = start + duration;

    const idx = Math.floor(rand() * RAW_SENTENCES.length);
    segments.push({
      id: `seg_${String(i + 1).padStart(4, '0')}`,
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      raw_text: RAW_SENTENCES[idx],
      edited_text: EDITED_SENTENCES[idx],
      status: 'review',
      important: false,
      needsCheck: false,
    });

    currentTime = end;
  }

  return segments;
}
