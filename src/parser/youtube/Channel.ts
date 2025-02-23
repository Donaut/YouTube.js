import type Actions from '../../core/Actions';
import TabbedFeed from '../../core/TabbedFeed';
import C4TabbedHeader from '../classes/C4TabbedHeader';
import CarouselHeader from '../classes/CarouselHeader';
import ChannelAboutFullMetadata from '../classes/ChannelAboutFullMetadata';
import ChannelMetadata from '../classes/ChannelMetadata';
import InteractiveTabbedHeader from '../classes/InteractiveTabbedHeader';
import MicroformatData from '../classes/MicroformatData';
import SubscribeButton from '../classes/SubscribeButton';
import Tab from '../classes/Tab';

import Feed from '../../core/Feed';
import FilterableFeed from '../../core/FilterableFeed';
import ChipCloudChip from '../classes/ChipCloudChip';
import ExpandableTab from '../classes/ExpandableTab';
import FeedFilterChipBar from '../classes/FeedFilterChipBar';
import { InnertubeError } from '../../utils/Utils';

import type { AppendContinuationItemsAction, ReloadContinuationItemsCommand } from '..';

export default class Channel extends TabbedFeed {
  header?: C4TabbedHeader | CarouselHeader | InteractiveTabbedHeader;
  metadata;
  subscribe_button?: SubscribeButton;
  current_tab?: Tab | ExpandableTab;

  constructor(actions: Actions, data: any, already_parsed = false) {
    super(actions, data, already_parsed);

    this.header = this.page.header?.item()?.as(C4TabbedHeader, CarouselHeader, InteractiveTabbedHeader);

    const metadata = this.page.metadata?.item().as(ChannelMetadata);
    const microformat = this.page.microformat?.as(MicroformatData);

    if (!metadata && !this.page.contents)
      throw new InnertubeError('Invalid channel', this);

    this.metadata = { ...metadata, ...(microformat || {}) };

    this.subscribe_button = this.page.header_memo.getType(SubscribeButton)?.[0];

    this.current_tab = this.page.contents.item().key('tabs').parsed().array().filterType(Tab, ExpandableTab).get({ selected: true });
  }

  /**
   * Applies given filter to the list. Use {@link filters} to get available filters.
   * @param filter - The filter to apply
   */
  async applyFilter(filter: string | ChipCloudChip): Promise<FilteredChannelList> {
    let target_filter: ChipCloudChip | undefined;

    const filter_chipbar = this.memo.getType(FeedFilterChipBar)?.[0];

    if (typeof filter === 'string') {
      target_filter = filter_chipbar?.contents.get({ text: filter });
      if (!target_filter)
        throw new InnertubeError(`Filter ${filter} not found`, { available_filters: this.filters });
    } else if (filter instanceof ChipCloudChip) {
      target_filter = filter;
    }

    if (!target_filter)
      throw new InnertubeError('Invalid filter', filter);

    const page = await target_filter.endpoint?.call(this.actions, { parse: true });
    return new FilteredChannelList(this.actions, page, true);
  }

  get filters(): string[] {
    return this.memo.getType(FeedFilterChipBar)?.[0]?.contents.filterType(ChipCloudChip).map((chip) => chip.text) || [];
  }

  async getHome(): Promise<Channel> {
    const tab = await this.getTabByURL('featured');
    return new Channel(this.actions, tab.page, true);
  }

  async getVideos(): Promise<Channel> {
    const tab = await this.getTabByURL('videos');
    return new Channel(this.actions, tab.page, true);
  }

  async getShorts(): Promise<Channel> {
    const tab = await this.getTabByURL('shorts');
    return new Channel(this.actions, tab.page, true);
  }

  async getLiveStreams(): Promise<Channel> {
    const tab = await this.getTabByURL('streams');
    return new Channel(this.actions, tab.page, true);
  }

  async getPlaylists(): Promise<Channel> {
    const tab = await this.getTabByURL('playlists');
    return new Channel(this.actions, tab.page, true);
  }

  async getCommunity(): Promise<Channel> {
    const tab = await this.getTabByURL('community');
    return new Channel(this.actions, tab.page, true);
  }

  async getChannels(): Promise<Channel> {
    const tab = await this.getTabByURL('channels');
    return new Channel(this.actions, tab.page, true);
  }

  /**
   * Retrieves the channel about page.
   * Note that this does not return a new {@link Channel} object.
   */
  async getAbout(): Promise<ChannelAboutFullMetadata> {
    const tab = await this.getTabByURL('about');
    return tab.memo.getType(ChannelAboutFullMetadata)?.[0];
  }

  /**
   * Searches within the channel.
   */
  async search(query: string): Promise<Channel> {
    const tab = this.memo.getType(ExpandableTab)?.[0];

    if (!tab)
      throw new InnertubeError('Search tab not found', this);

    const page = await tab.endpoint?.call(this.actions, { query, parse: true });

    return new Channel(this.actions, page, true);
  }

  /**
   * Retrives list continuation.
   */
  async getContinuation(): Promise<ChannelListContinuation> {
    const page = await super.getContinuationData();
    return new ChannelListContinuation(this.actions, page, true);
  }
}

export class ChannelListContinuation extends Feed {
  contents: ReloadContinuationItemsCommand | AppendContinuationItemsAction | undefined;

  constructor(actions: Actions, data: any, already_parsed = false) {
    super(actions, data, already_parsed);
    this.contents =
      this.page.on_response_received_actions?.[0] ||
      this.page.on_response_received_endpoints?.[0];
  }

  /**
   * Retrieves list continuation.
   */
  async getContinuation(): Promise<ChannelListContinuation> {
    const page = await super.getContinuationData();
    return new ChannelListContinuation(this.actions, page, true);
  }
}

export class FilteredChannelList extends FilterableFeed {
  applied_filter?: ChipCloudChip;
  contents;

  constructor(actions: Actions, data: any, already_parsed = false) {
    super(actions, data, already_parsed);

    this.applied_filter = this.memo.getType(ChipCloudChip).get({ is_selected: true });

    // Removes the filter chipbar from the actions list
    if (
      this.page.on_response_received_actions &&
      this.page.on_response_received_actions.length > 1
    ) {
      this.page.on_response_received_actions.shift();
    }

    this.contents = this.page.on_response_received_actions?.[0];
  }

  /**
   * Applies given filter to the list.
   * @param filter - The filter to apply
   */
  async applyFilter(filter: string | ChipCloudChip): Promise<FilteredChannelList> {
    const feed = await super.getFilteredFeed(filter);
    return new FilteredChannelList(this.actions, feed.page, true);
  }

  /**
   * Retrieves list continuation.
   */
  async getContinuation(): Promise<FilteredChannelList> {
    const page = await super.getContinuationData();

    // Keep the filters
    page?.on_response_received_actions_memo.set('FeedFilterChipBar', this.memo.getType(FeedFilterChipBar));
    page?.on_response_received_actions_memo.set('ChipCloudChip', this.memo.getType(ChipCloudChip));

    return new FilteredChannelList(this.actions, page, true);
  }
}