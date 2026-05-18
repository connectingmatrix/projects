import { AIAgentProjectEntity } from './AIAgentProjectEntity';
import { BookmarkEntity } from './BookmarkEntity';
import { GlobalEntity } from './GlobalEntity';
import { SharedSpaceCatalogEntity } from './SharedSpaceCatalogEntity';
import { SharedSpaceEntity } from './SharedSpaceEntity';
import { SubjectTagEntity } from './SubjectTagEntity';
import { TagEntity } from './TagEntity';
import { CategoryEntity } from './tree/Category';
import { ChannelEntity } from './tree/Channel';
import { PostEntity } from './tree/Post';
import { SubjectEntity } from './tree/Subject';

export const projectEntities = [
  AIAgentProjectEntity,
  BookmarkEntity,
  GlobalEntity,
  SharedSpaceCatalogEntity,
  SharedSpaceEntity,
  SubjectTagEntity,
  TagEntity,
  CategoryEntity,
  ChannelEntity,
  PostEntity,
  SubjectEntity,
] as const;
