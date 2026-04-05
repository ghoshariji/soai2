import React from 'react';
import HomeScreen from '@/screens/user/HomeScreen';

/**
 * Society admin community feed — same as resident Home feed UI, but create/delete/comment
 * are enabled from role. Header: back to community, Groups icon (create group + list), no resident-only stacks.
 */
const FeedScreen: React.FC = () => <HomeScreen hideShortcuts />;

export default FeedScreen;
