import { ExpertTalkContentType } from '@modules/master/enums/expert-talk-content-type.enum';

export interface IPublicExpertTalkItem {
  refId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnail: string | { key: string; name: string; url: string } | null;
  contentType: ExpertTalkContentType;
  sortOrder: number;
}

export interface IPublicTestimonialItem {
  refId: string;
  name: string;
  city: string;
  rating: number;
  description: string;
  image: string | { key: string; name: string; url: string } | null;
  sortOrder: number;
}

export interface IPublicCuratedWellnessEssentialsSection {
  expertTalks: IPublicExpertTalkItem[];
  testimonials: IPublicTestimonialItem[];
}
