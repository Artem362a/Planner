import React from 'react';
import { Button, Flex, Space } from 'antd';

const MenuButton = () => {
  const now = new Date();
  const dateString = now.toLocaleDateString('ru-RU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Flex gap="small" wrap>
      <Button type="primary">Primary Button</Button>
    </Flex>
  );
};

export default MenuButton;
