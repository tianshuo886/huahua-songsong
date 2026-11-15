#!/usr/bin/env python3
"""按统一口径重出 public/img/ 下的产品图。

口径（见 AGENTS.md「图片约定」）：
  · 场景图   —— 原尺寸不缩，q85
  · 植株图   —— 原尺寸不缩，q85
  · 图标     —— 缩到 384px（显示最大 48px，DPR2 仍 4 倍富余），q85

输入取 public/img/_source/<组>/<名>.jpg（原始大图，不进 Git），
输出写回 public/img/<组>/<名>.jpg。

用法：
  python3 tools/reencode-img.py              # 全部重出
  python3 tools/reencode-img.py scenes       # 只重出某个组
  python3 tools/reencode-img.py --dry-run    # 只看会变成多大，不写文件
"""
import io
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public' / 'img'
SRC = PUB / '_source'

QUALITY = 85
# 图标缩到这个边长：页面最大 48px 显示，DPR2 需要 96px，384 留足余量又不浪费
ICON_SIZE = 384
ICON_GROUPS = {'weather', 'status', 'actions'}
# 场景图里也有页面只按小尺寸显示的（空状态 96px），别整张 1024 塞进页面
SMALL_SCENES = {'scene_empty_state.jpg': 384}


def encode(im, quality=QUALITY):
    """编码成渐进式 JPEG，返回字节。渐进式先出模糊轮廓，网络慢时观感更好。"""
    buf = io.BytesIO()
    im.convert('RGB').save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def target_size(group, name, im):
    """产品图的目标尺寸：图标缩到 ICON_SIZE，少数小尺寸场景同理，其余保持原尺寸。"""
    if group in ICON_GROUPS and max(im.size) > ICON_SIZE:
        return im.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    edge = SMALL_SCENES.get(name) if group == 'scenes' else None
    if edge and max(im.size) > edge:
        return im.resize((edge, edge), Image.LANCZOS)
    return im


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    dry = '--dry-run' in sys.argv
    groups = args or [d.name for d in sorted(SRC.iterdir()) if d.is_dir()]

    total_before = total_after = 0
    count = 0
    for group in groups:
        src_dir, out_dir = SRC / group, PUB / group
        if not src_dir.is_dir():
            print(f'跳过 {group}：没有 _source 目录')
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        for src in sorted(src_dir.glob('*.jpg')):
            out = out_dir / src.name
            before = out.stat().st_size if out.exists() else 0
            with Image.open(src) as im:
                im = target_size(group, src.name, im)
                data = encode(im)
                dims = f'{im.size[0]}x{im.size[1]}'
            if not dry:
                out.write_bytes(data)
            after = len(data)
            total_before += before
            total_after += after
            count += 1
            flag = '  ' if not before else ('↓' if after < before else '↑')
            print(f'{flag} {group}/{src.name:36} {before // 1024:5}K → {after // 1024:5}K  {dims}')

    verb = '预计' if dry else '实际'
    print(f'\n{count} 张：{total_before / 1048576:.1f}M → {total_after / 1048576:.1f}M'
          f'（{verb}，均值 {total_after // max(count, 1) // 1024}K/张）')


if __name__ == '__main__':
    main()
