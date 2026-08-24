/**
 * 路线标签和其他设置。
 *
 * 维护 tags、怪物拾取区分和地图匹配方法，不处理点位几何。
 */
import {
  polylines,
  otherConfig,
  showCommonTagManager,
  polylineTagsSelectIndex,
} from '../stores/editor';

/**
 * 打开指定路线的其他设置弹窗。
 */
export function commonTagManagerModal(index) {
  otherConfig.value.commonTag = polylines.value[index].tags || [];
  otherConfig.value.enableMonsterLootSplit = !!polylines.value[index].enable_monster_loot_split;
  otherConfig.value.mapMatchMethod = polylines.value[index].map_match_method || '';
  polylineTagsSelectIndex.value = index;
  showCommonTagManager.value = true;
}

/**
 * 把其他设置写回对应路线。
 */
export function saveCommonTagManagerModal() {
  polylines.value[polylineTagsSelectIndex.value].tags = otherConfig.value.commonTag;
  polylines.value[polylineTagsSelectIndex.value].enable_monster_loot_split = otherConfig.value.enableMonsterLootSplit;
  polylines.value[polylineTagsSelectIndex.value].map_match_method = otherConfig.value.mapMatchMethod;
}

/**
 * 把中文逗号和英文逗号拆成多个标签。
 */
export function commonTagChange() {
  let tags = otherConfig.value.commonTag;
  const newTags = [];
  for (let i = 0; i < tags.length; i++) {
    let tag = tags[i];
    tag = tag.replaceAll('，', ',');
    tag.split(',').filter((t) => t).forEach((t) => newTags[newTags.length] = t);
  }
  otherConfig.value.commonTag = newTags;
}
